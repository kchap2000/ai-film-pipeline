import { createRouteClient } from "@/lib/supabase-route";
import { createGenerationJob, resolveFirstFrameTargetPanels } from "@/lib/generation-jobs";
import { getProjectAccess } from "@/lib/project-access";
import {
  brainTargetLabel,
  normalizeBrainIntent,
  normalizeBrainPriority,
  normalizeBrainTargetType,
  normalizeContinuityCategory,
} from "@/lib/project-brain";
import { recordProjectActivity } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function nullableUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function appendDirectorNote(description: string | null, note: string) {
  const base = String(description || "").trim();
  const trimmedNote = note.trim();
  if (!trimmedNote) return base;
  if (base.toLowerCase().includes(trimmedNote.toLowerCase())) return base;
  const prefix = "Director continuity note:";
  return [base, `${prefix} ${trimmedNote}`].filter(Boolean).join("\n");
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const targetType = normalizeBrainTargetType(req.nextUrl.searchParams.get("target_type"));
  const targetId = req.nextUrl.searchParams.get("target_id");

  const [feedbackRes, continuityRes] = await Promise.all([
    supabase
      .from("project_feedback")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("project_continuity_rules")
      .select("*")
      .eq("project_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (feedbackRes.error) {
    return NextResponse.json({ error: feedbackRes.error.message }, { status: 500 });
  }
  if (continuityRes.error) {
    return NextResponse.json({ error: continuityRes.error.message }, { status: 500 });
  }

  const feedback = (feedbackRes.data || []).filter((item) => {
    if (item.target_type === "project") return true;
    if (!targetId) return item.target_type === targetType;
    return item.target_type === targetType && item.target_id === targetId;
  });

  const continuity = (continuityRes.data || []).filter((rule) => {
    if (rule.scope_type === "project") return true;
    if (!targetId) return rule.scope_type === targetType;
    return rule.scope_type === targetType && rule.scope_id === targetId;
  });

  return NextResponse.json({ access, feedback, continuity });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.body || "").trim();
  if (!text) {
    return NextResponse.json({ error: "Feedback text is required" }, { status: 400 });
  }

  const targetType = normalizeBrainTargetType(body.target_type);
  const targetId = targetType === "project" ? null : nullableUuid(body.target_id);
  const targetLabel = brainTargetLabel(targetType, body.target_label);
  const intent = normalizeBrainIntent(body.intent);
  const priority = normalizeBrainPriority(body.priority);
  const category = normalizeContinuityCategory(body.category);
  const transcriptSource = body.transcript_source === "speech" ? "speech" : "typed";
  const shouldCreateRule = Boolean(body.create_rule) || intent === "continuity_rule";
  let wardrobeTargetForApply: { id: string; project_id: string; description: string | null; notes: string | null; locked: boolean } | null = null;
  if (body.action === "apply_wardrobe_note" && (targetType !== "outfit" || !targetId)) {
    return NextResponse.json({ error: "A wardrobe target is required to apply this note." }, { status: 400 });
  }
  if (body.action === "apply_wardrobe_note") {
    const { data: wardrobeItem, error: wardrobeError } = await supabase
      .from("wardrobe_items")
      .select("id, project_id, description, notes, locked")
      .eq("id", targetId)
      .eq("project_id", id)
      .maybeSingle();

    if (wardrobeError || !wardrobeItem) {
      return NextResponse.json({ error: wardrobeError?.message || "Wardrobe item not found" }, { status: 404 });
    }
    wardrobeTargetForApply = wardrobeItem;
  }

  const { data: feedback, error } = await supabase
    .from("project_feedback")
    .insert({
      project_id: id,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      phase: typeof body.phase === "string" ? body.phase : null,
      intent,
      priority,
      status: intent === "regenerate" || intent === "approval_blocker" ? "open" : "open",
      body: text,
      transcript_source: transcriptSource,
      created_by: user && !user.isAnonymous ? user.id : null,
      created_by_email: user?.email ?? null,
      metadata: {
        action: body.action || null,
        queued_regeneration: intent === "regenerate" || body.action === "queue_regeneration",
      },
    })
    .select("*")
    .single();

  if (error || !feedback) {
    return NextResponse.json({ error: error?.message || "Feedback insert failed" }, { status: 500 });
  }

  let continuityRule = null;
  if (shouldCreateRule) {
    const { data: rule, error: ruleError } = await supabase
      .from("project_continuity_rules")
      .insert({
        project_id: id,
        scope_type: targetType,
        scope_id: targetId,
        scope_label: targetLabel,
        category,
        rule_text: text,
        strength: priority,
        status: "active",
        source_feedback_id: feedback.id,
        created_by: user && !user.isAnonymous ? user.id : null,
        created_by_email: user?.email ?? null,
        metadata: { promoted_from_intent: intent },
      })
      .select("*")
      .single();

    if (ruleError) {
      return NextResponse.json({ error: ruleError.message }, { status: 500 });
    }
    continuityRule = rule;
  }

  let appliedTarget = null;
  if (body.action === "apply_wardrobe_note") {
    const nextDescription = appendDirectorNote(wardrobeTargetForApply?.description || "", text);
    const nextNotes = [
      String(wardrobeTargetForApply?.notes || "").trim(),
      `Applied from Project Brain feedback ${feedback.id}: ${text}`,
    ].filter(Boolean).join("\n");

    const { data: updatedWardrobe, error: updateWardrobeError } = await supabase
      .from("wardrobe_items")
      .update({
        description: nextDescription,
        notes: nextNotes,
        locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .eq("project_id", id)
      .select("id, description, notes, locked, updated_at")
      .single();

    if (updateWardrobeError || !updatedWardrobe) {
      return NextResponse.json({ error: updateWardrobeError?.message || "Could not update wardrobe item" }, { status: 500 });
    }

    appliedTarget = {
      type: "wardrobe_item",
      id: updatedWardrobe.id,
      locked: updatedWardrobe.locked,
    };

    await supabase
      .from("project_feedback")
      .update({
        status: "applied",
        metadata: {
          ...(feedback.metadata || {}),
          applied_target: appliedTarget,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", feedback.id)
      .eq("project_id", id);

    await recordProjectActivity(supabase, {
      projectId: id,
      activityType: "wardrobe_feedback_applied",
      title: `Applied wardrobe feedback to ${targetLabel}`,
      body: text.slice(0, 180),
      actorUserId: user && !user.isAnonymous ? user.id : null,
      actorEmail: user?.email ?? null,
      metadata: { feedback_id: feedback.id, wardrobe_item_id: targetId },
    });
  }

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: appliedTarget ? "brain_note_applied" : shouldCreateRule ? "brain_rule_created" : "feedback_created",
    title: appliedTarget ? `Applied note to ${targetLabel}` : shouldCreateRule ? `Saved continuity for ${targetLabel}` : `Added feedback on ${targetLabel}`,
    body: text.slice(0, 180),
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: { feedback_id: feedback.id, rule_id: continuityRule?.id ?? null, target_type: targetType, target_id: targetId, applied_target: appliedTarget },
  });

  let regeneration = null;
  const shouldRegenerate = intent === "regenerate" || body.action === "queue_regeneration";
  if (shouldRegenerate) {
    const resolved = await resolveFirstFrameTargetPanels(supabase, id, targetType, targetId);
    if (!resolved.supported) {
      regeneration = {
        supported: false,
        queued: true,
        executed: false,
        reason: resolved.reason,
      };
      await supabase
        .from("project_feedback")
        .update({
          metadata: {
            ...(feedback.metadata || {}),
            regeneration,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", feedback.id)
        .eq("project_id", id);
    } else {
      const job = await createGenerationJob(supabase, {
        projectId: id,
        jobType: "first_frame_regeneration",
        action: "regenerate",
        targetType,
        targetId,
        targetLabel,
        priority,
        prompt: text,
        sourceFeedbackId: feedback.id,
        requestedBy: user,
        metadata: {
          panel_ids: resolved.panelIds,
          phase: typeof body.phase === "string" ? body.phase : null,
          source: "project_brain",
        },
      });
      regeneration = {
        supported: true,
        queued: true,
        executed: false,
        job_id: job.id,
        panel_ids: resolved.panelIds,
      };
      await supabase
        .from("project_feedback")
        .update({
          metadata: {
            ...(feedback.metadata || {}),
            regeneration,
            generation_job_id: job.id,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", feedback.id)
        .eq("project_id", id);

      await recordProjectActivity(supabase, {
        projectId: id,
        activityType: "brain_regeneration_queued",
        title: `Queued regeneration for ${targetLabel}`,
        body: text.slice(0, 180),
        actorUserId: user && !user.isAnonymous ? user.id : null,
        actorEmail: user?.email ?? null,
        metadata: {
          feedback_id: feedback.id,
          job_id: job.id,
          target_type: targetType,
          target_id: targetId,
          panel_ids: resolved.panelIds,
        },
      });
    }
  }

  return NextResponse.json({ feedback, continuity_rule: continuityRule, regeneration, applied_target: appliedTarget }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const feedbackId = nullableUuid(body.feedback_id);
  if (!feedbackId) {
    return NextResponse.json({ error: "feedback_id is required" }, { status: 400 });
  }

  const status = String(body.status || "");
  if (!["open", "applied", "ignored", "resolved"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("project_feedback")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", feedbackId)
    .eq("project_id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: "feedback_updated",
    title: `Marked feedback ${status}`,
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: { feedback_id: feedbackId, status },
  });

  return NextResponse.json({ feedback: data });
}
