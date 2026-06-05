import { createRouteClient } from "@/lib/supabase-route";
import { generateProjectFirstFrames } from "@/lib/first-frame-generation";
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

async function resolveRegenerationPanels(
  supabase: Awaited<ReturnType<typeof createRouteClient>>["supabase"],
  projectId: string,
  targetType: ReturnType<typeof normalizeBrainTargetType>,
  targetId: string | null
) {
  if (!targetId) {
    return { panelIds: [], supported: false, reason: "Select a scene, storyboard panel, or first frame to regenerate." };
  }

  if (targetType === "storyboard_panel") {
    return { panelIds: [targetId], supported: true, reason: null };
  }

  if (targetType === "first_frame") {
    const { data, error } = await supabase
      .from("first_frames")
      .select("panel_id")
      .eq("id", targetId)
      .eq("project_id", projectId)
      .single();
    if (error || !data?.panel_id) {
      return { panelIds: [], supported: false, reason: "Could not find the source storyboard panel for this first frame." };
    }
    return { panelIds: [data.panel_id], supported: true, reason: null };
  }

  if (targetType === "scene") {
    const { data, error } = await supabase
      .from("storyboard_panels")
      .select("id")
      .eq("project_id", projectId)
      .eq("scene_id", targetId)
      .order("panel_number", { ascending: true });
    if (error || !data?.length) {
      return { panelIds: [], supported: false, reason: "This scene does not have storyboard panels to regenerate yet." };
    }
    return { panelIds: data.map((panel) => panel.id), supported: true, reason: null };
  }

  return {
    panelIds: [],
    supported: false,
    reason: "Regeneration from Project Brain is currently wired for scenes, storyboard panels, and first frames.",
  };
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

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: shouldCreateRule ? "brain_rule_created" : "feedback_created",
    title: shouldCreateRule ? `Saved continuity for ${targetLabel}` : `Added feedback on ${targetLabel}`,
    body: text.slice(0, 180),
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: { feedback_id: feedback.id, rule_id: continuityRule?.id ?? null, target_type: targetType, target_id: targetId },
  });

  let regeneration = null;
  const shouldRegenerate = intent === "regenerate" || body.action === "queue_regeneration";
  if (shouldRegenerate) {
    const resolved = await resolveRegenerationPanels(supabase, id, targetType, targetId);
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
      const result = await generateProjectFirstFrames(supabase, id, {
        panelIds: resolved.panelIds,
        feedbackNote: text,
        feedbackId: feedback.id,
      });
      regeneration = {
        supported: true,
        queued: true,
        executed: result.success,
        frames_generated: result.framesGenerated,
        panels_processed: result.panelsProcessed,
        frame_ids: result.frameIds,
        errors: result.errors,
      };
      const nextStatus = result.framesGenerated > 0 ? "applied" : "open";
      await supabase
        .from("project_feedback")
        .update({
          status: nextStatus,
          metadata: {
            ...(feedback.metadata || {}),
            regeneration,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", feedback.id)
        .eq("project_id", id);

      await recordProjectActivity(supabase, {
        projectId: id,
        activityType: result.framesGenerated > 0 ? "brain_regeneration_applied" : "brain_regeneration_failed",
        title:
          result.framesGenerated > 0
            ? `Generated ${result.framesGenerated} frame${result.framesGenerated === 1 ? "" : "s"} from Project Brain`
            : `Project Brain regeneration did not complete for ${targetLabel}`,
        body: text.slice(0, 180),
        actorUserId: user && !user.isAnonymous ? user.id : null,
        actorEmail: user?.email ?? null,
        metadata: {
          feedback_id: feedback.id,
          target_type: targetType,
          target_id: targetId,
          panel_ids: resolved.panelIds,
          ...regeneration,
        },
      });
    }
  }

  return NextResponse.json({ feedback, continuity_rule: continuityRule, regeneration }, { status: 201 });
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
