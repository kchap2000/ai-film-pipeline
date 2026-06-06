import { createRouteClient } from "@/lib/supabase-route";
import { getProjectAccess } from "@/lib/project-access";
import { normalizeBrainPriority, normalizeBrainTargetType } from "@/lib/project-brain";
import { getStalenessReport } from "@/lib/provenance";
import { recordProjectActivity } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function nullableUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function isMissingAgentSchema(error: { message?: string } | null) {
  const message = String(error?.message || "").toLowerCase();
  return ["change_requests", "agent_runs", "agent_steps", "asset_impacts", "agent_verifications", "schema cache", "relation"].some((hint) =>
    message.includes(hint)
  );
}

function labelFor(value: string) {
  return value.replace(/_/g, " ");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const [requestsRes, runsRes] = await Promise.all([
    supabase
      .from("change_requests")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("agent_runs")
      .select("*, agent_steps(*)")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (requestsRes.error || runsRes.error) {
    const error = requestsRes.error || runsRes.error;
    if (isMissingAgentSchema(error)) {
      return NextResponse.json({
        available: false,
        change_requests: [],
        agent_runs: [],
        reason: "Agent planning schema has not been applied yet.",
      });
    }
    return NextResponse.json({ error: error?.message || "Could not load agent plans" }, { status: 500 });
  }

  return NextResponse.json({
    available: true,
    change_requests: requestsRes.data || [],
    agent_runs: runsRes.data || [],
  });
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
    return NextResponse.json({ error: "Change request text is required" }, { status: 400 });
  }

  const targetType = normalizeBrainTargetType(body.target_type);
  const targetId = targetType === "project" ? null : nullableUuid(body.target_id);
  const targetLabel = String(body.target_label || labelFor(targetType)).trim();
  const priority = normalizeBrainPriority(body.priority);
  const transcriptSource = body.transcript_source === "speech" ? "speech" : "typed";
  const staleness = await getStalenessReport(supabase, id);
  const impacted = staleness.stale.filter((item) => {
    if (targetType === "project") return true;
    return item.source_type === targetType && (!targetId || item.source_id === targetId);
  });

  const planSteps = [
    {
      step_type: "capture_change_request",
      title: `Capture change for ${targetLabel}`,
      body: text,
      status: "completed",
      sort_order: 1,
      tool_name: "change_requests",
    },
    {
      step_type: "update_continuity_memory",
      title: "Update project continuity memory",
      body: "Save the creative instruction as a reusable rule before future generation.",
      status: "planned",
      sort_order: 2,
      tool_name: "project_continuity_rules",
    },
    {
      step_type: "impact_analysis",
      title: "Check upstream and downstream impact",
      body:
        impacted.length > 0
          ? `${impacted.length} stale downstream asset${impacted.length === 1 ? "" : "s"} already detected.`
          : "No stale downstream assets are currently recorded for this target.",
      status: "planned",
      sort_order: 3,
      tool_name: "asset_provenance",
    },
    {
      step_type: "queue_generation",
      title: "Queue affected generation work",
      body: "Create generation jobs for assets that need regeneration after producer approval.",
      status: "planned",
      sort_order: 4,
      tool_name: "generation_jobs",
    },
    {
      step_type: "verify_outputs",
      title: "Verify continuity after updates",
      body: "Check regenerated assets against aspect ratio, identity, wardrobe, props, and visual rules.",
      status: "planned",
      sort_order: 5,
      tool_name: "agent_verifications",
    },
  ];

  const { data: changeRequest, error: requestError } = await supabase
    .from("change_requests")
    .insert({
      project_id: id,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      body: text,
      transcript_source: transcriptSource,
      priority,
      status: "planned",
      requested_by: user && !user.isAnonymous ? user.id : null,
      requested_by_email: user?.email ?? null,
      metadata: {
        source: "agent_planner",
        impact_count: impacted.length,
      },
    })
    .select("*")
    .single();

  if (requestError || !changeRequest) {
    if (isMissingAgentSchema(requestError)) {
      return NextResponse.json(
        { error: "Agent planning schema has not been applied yet.", available: false },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: requestError?.message || "Could not create change request" }, { status: 500 });
  }

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      project_id: id,
      change_request_id: changeRequest.id,
      run_type: "impact_plan",
      status: "planned",
      summary: `Plan created for ${targetLabel}`,
      requested_by: user && !user.isAnonymous ? user.id : null,
      requested_by_email: user?.email ?? null,
      metadata: {
        target_type: targetType,
        target_id: targetId,
        priority,
      },
    })
    .select("*")
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || "Could not create agent run" }, { status: 500 });
  }

  const { data: steps, error: stepsError } = await supabase
    .from("agent_steps")
    .insert(
      planSteps.map((step) => ({
        project_id: id,
        agent_run_id: run.id,
        ...step,
      }))
    )
    .select("*");

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 });
  }

  if (impacted.length > 0) {
    await supabase.from("asset_impacts").insert(
      impacted.map((item) => ({
        project_id: id,
        change_request_id: changeRequest.id,
        agent_run_id: run.id,
        source_type: item.source_type,
        source_id: item.source_id,
        asset_type: item.asset_type,
        asset_id: item.asset_id,
        impact_type: "stale_dependency",
        severity: priority,
        status: "needs_review",
        metadata: {
          relationship: item.relationship,
          source_version: item.source_version,
          current_version: item.current_version,
          is_missing_source: item.is_missing_source,
        },
      }))
    );
  }

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: "agent_plan_created",
    title: `Agent plan created for ${targetLabel}`,
    body: text.slice(0, 180),
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: {
      change_request_id: changeRequest.id,
      agent_run_id: run.id,
      impact_count: impacted.length,
    },
  });

  return NextResponse.json(
    {
      available: true,
      change_request: changeRequest,
      agent_run: run,
      steps: steps || [],
      impact_count: impacted.length,
    },
    { status: 201 }
  );
}
