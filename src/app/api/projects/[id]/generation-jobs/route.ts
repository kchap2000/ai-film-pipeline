import { createGenerationJob, runGenerationJob, updateGenerationJobStatus } from "@/lib/generation-jobs";
import { getProjectAccess } from "@/lib/project-access";
import {
  brainTargetLabel,
  normalizeBrainPriority,
  normalizeBrainTargetType,
} from "@/lib/project-brain";
import { createRouteClient } from "@/lib/supabase-route";
import type { GenerationJobAction, GenerationJobType } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_TYPES: GenerationJobType[] = [
  "first_frame_generation",
  "first_frame_regeneration",
  "storyboard_generation",
  "scene_scout_generation",
  "location_generation",
  "cast_generation",
  "pose_sheet_generation",
  "wardrobe_generation",
  "prop_generation",
];

const JOB_ACTIONS: GenerationJobAction[] = ["generate", "regenerate", "replace", "export"];

function nullableUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function normalizeJobType(value: unknown): GenerationJobType {
  return JOB_TYPES.includes(value as GenerationJobType)
    ? (value as GenerationJobType)
    : "first_frame_regeneration";
}

function normalizeJobAction(value: unknown): GenerationJobAction {
  return JOB_ACTIONS.includes(value as GenerationJobAction)
    ? (value as GenerationJobAction)
    : "regenerate";
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

  const targetType = req.nextUrl.searchParams.get("target_type");
  const targetId = req.nextUrl.searchParams.get("target_id");
  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 200);

  let query = supabase
    .from("generation_jobs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetType) query = query.eq("target_type", normalizeBrainTargetType(targetType));
  if (targetId) query = query.eq("target_id", targetId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ access, jobs: data || [] });
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
  if (body.action === "run") {
    if (!access.canGenerate) {
      return NextResponse.json({ error: "Only producers can run generation jobs" }, { status: 403 });
    }
    const jobId = nullableUuid(body.job_id);
    if (!jobId) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }
    const job = await runGenerationJob(supabase, { projectId: id, jobId, user });
    return NextResponse.json({ job });
  }

  if (!access.canGenerate && body.action !== "request") {
    return NextResponse.json({ error: "Only producers can create direct generation jobs" }, { status: 403 });
  }

  const targetType = normalizeBrainTargetType(body.target_type);
  const targetId = targetType === "project" ? null : nullableUuid(body.target_id);
  const targetLabel = brainTargetLabel(targetType, body.target_label);
  const job = await createGenerationJob(supabase, {
    projectId: id,
    jobType: normalizeJobType(body.job_type),
    action: normalizeJobAction(body.job_action),
    targetType,
    targetId,
    targetLabel,
    priority: normalizeBrainPriority(body.priority),
    prompt: String(body.prompt || ""),
    sourceFeedbackId: nullableUuid(body.source_feedback_id),
    requestedBy: user,
    metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
  });

  return NextResponse.json({ job }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canGenerate) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const jobId = nullableUuid(body.job_id);
  if (!jobId) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Unsupported job action" }, { status: 400 });
  }

  const job = await updateGenerationJobStatus(supabase, {
    projectId: id,
    jobId,
    status: "cancelled",
    errorMessage: "Cancelled by producer.",
  });
  return NextResponse.json({ job });
}
