import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProjectFirstFrames } from "@/lib/first-frame-generation";
import type { RouteUser } from "@/lib/project-access";
import type {
  GenerationJobAction,
  GenerationJobStatus,
  GenerationJobType,
} from "@/lib/types";
import type { BrainPriority, BrainTargetType } from "@/lib/project-brain";
import { recordProjectActivity } from "@/lib/workflow";

export interface ResolvedFirstFrameTarget {
  panelIds: string[];
  supported: boolean;
  reason: string | null;
}

export async function resolveFirstFrameTargetPanels(
  supabase: SupabaseClient,
  projectId: string,
  targetType: BrainTargetType,
  targetId: string | null
): Promise<ResolvedFirstFrameTarget> {
  if (!targetId) {
    return {
      panelIds: [],
      supported: false,
      reason: "Select a scene, storyboard panel, or first frame to regenerate.",
    };
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
      return {
        panelIds: [],
        supported: false,
        reason: "Could not find the source storyboard panel for this first frame.",
      };
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
      return {
        panelIds: [],
        supported: false,
        reason: "This scene does not have storyboard panels to regenerate yet.",
      };
    }
    return { panelIds: data.map((panel) => panel.id), supported: true, reason: null };
  }

  return {
    panelIds: [],
    supported: false,
    reason: "Regeneration jobs are currently runnable for scenes, storyboard panels, and first frames.",
  };
}

export async function createGenerationJob(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    jobType: GenerationJobType;
    action: GenerationJobAction;
    targetType: BrainTargetType;
    targetId: string | null;
    targetLabel: string;
    priority: BrainPriority;
    prompt: string;
    sourceFeedbackId?: string | null;
    requestedBy?: RouteUser | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      project_id: input.projectId,
      job_type: input.jobType,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      target_label: input.targetLabel,
      status: "queued",
      priority: input.priority,
      prompt: input.prompt,
      source_feedback_id: input.sourceFeedbackId ?? null,
      requested_by: input.requestedBy && !input.requestedBy.isAnonymous ? input.requestedBy.id : null,
      requested_by_email: input.requestedBy?.email ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordProjectActivity(supabase, {
    projectId: input.projectId,
    activityType: "generation_job_queued",
    title: `Queued ${input.jobType.replace(/_/g, " ")}`,
    body: input.prompt.slice(0, 180),
    actorUserId: input.requestedBy && !input.requestedBy.isAnonymous ? input.requestedBy.id : null,
    actorEmail: input.requestedBy?.email ?? null,
    metadata: {
      job_id: data.id,
      target_type: input.targetType,
      target_id: input.targetId,
      source_feedback_id: input.sourceFeedbackId ?? null,
    },
  });

  return data;
}

export async function updateGenerationJobStatus(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    jobId: string;
    status: GenerationJobStatus;
    errorMessage?: string | null;
    resultAssetType?: string | null;
    resultAssetIds?: string[];
    metadata?: Record<string, unknown>;
  }
) {
  const update: Record<string, unknown> = {
    status: input.status,
    error_message: input.errorMessage ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.status === "completed" || input.status === "failed" || input.status === "cancelled") {
    update.completed_at = new Date().toISOString();
  }
  if (input.resultAssetType !== undefined) update.result_asset_type = input.resultAssetType;
  if (input.resultAssetIds !== undefined) update.result_asset_ids = input.resultAssetIds;
  if (input.metadata !== undefined) update.metadata = input.metadata;

  const { data, error } = await supabase
    .from("generation_jobs")
    .update(update)
    .eq("id", input.jobId)
    .eq("project_id", input.projectId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function runGenerationJob(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    jobId: string;
    user?: RouteUser | null;
  }
) {
  const { data: job, error } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("id", input.jobId)
    .eq("project_id", input.projectId)
    .single();

  if (error || !job) {
    throw new Error(error?.message || "Generation job not found");
  }
  if (job.status !== "queued" && job.status !== "failed") {
    throw new Error(`Generation job is ${job.status}; only queued or failed jobs can run.`);
  }

  const startedAt = new Date().toISOString();
  const { error: startError } = await supabase
    .from("generation_jobs")
    .update({
      status: "running",
      started_at: startedAt,
      updated_at: startedAt,
      started_by: input.user && !input.user.isAnonymous ? input.user.id : null,
      started_by_email: input.user?.email ?? null,
      error_message: null,
    })
    .eq("id", input.jobId)
    .eq("project_id", input.projectId);
  if (startError) throw new Error(startError.message);

  try {
    if (job.job_type !== "first_frame_generation" && job.job_type !== "first_frame_regeneration") {
      throw new Error(`No runner is implemented for ${job.job_type}.`);
    }

    const metadata = (job.metadata || {}) as Record<string, unknown>;
    const panelIds = Array.isArray(metadata.panel_ids)
      ? metadata.panel_ids.filter((id): id is string => typeof id === "string")
      : [];
    const resolved =
      panelIds.length > 0
        ? { panelIds, supported: true, reason: null }
        : await resolveFirstFrameTargetPanels(
            supabase,
            input.projectId,
            job.target_type as BrainTargetType,
            job.target_id || null
          );

    if (!resolved.supported || resolved.panelIds.length === 0) {
      throw new Error(resolved.reason || "No storyboard panels resolved for this job.");
    }

    const result = await generateProjectFirstFrames(supabase, input.projectId, {
      panelIds: resolved.panelIds,
      feedbackNote: job.prompt,
      feedbackId: job.source_feedback_id || null,
    });

    const nextStatus: GenerationJobStatus = result.framesGenerated > 0 ? "completed" : "failed";
    const errorMessage =
      nextStatus === "failed"
        ? result.errors.join("; ") || "Generation completed without producing frames."
        : null;
    const completed = await updateGenerationJobStatus(supabase, {
      projectId: input.projectId,
      jobId: input.jobId,
      status: nextStatus,
      errorMessage,
      resultAssetType: "first_frame",
      resultAssetIds: result.frameIds,
      metadata: {
        ...metadata,
        panel_ids: resolved.panelIds,
        frames_generated: result.framesGenerated,
        panels_processed: result.panelsProcessed,
        errors: result.errors,
      },
    });

    if (job.source_feedback_id) {
      const { data: feedbackRow } = await supabase
        .from("project_feedback")
        .select("metadata")
        .eq("id", job.source_feedback_id)
        .eq("project_id", input.projectId)
        .single();

      await supabase
        .from("project_feedback")
        .update({
          status: nextStatus === "completed" ? "applied" : "open",
          updated_at: new Date().toISOString(),
          metadata: {
            ...(feedbackRow?.metadata || {}),
            generation_job_id: input.jobId,
            job_status: nextStatus,
            frame_ids: result.frameIds,
          },
        })
        .eq("id", job.source_feedback_id)
        .eq("project_id", input.projectId);
    }

    await recordProjectActivity(supabase, {
      projectId: input.projectId,
      activityType: nextStatus === "completed" ? "generation_job_completed" : "generation_job_failed",
      title:
        nextStatus === "completed"
          ? `Generated ${result.framesGenerated} first frame${result.framesGenerated === 1 ? "" : "s"}`
          : `Generation job failed for ${job.target_label}`,
      body: errorMessage,
      actorUserId: input.user && !input.user.isAnonymous ? input.user.id : null,
      actorEmail: input.user?.email ?? null,
      metadata: {
        job_id: input.jobId,
        target_type: job.target_type,
        target_id: job.target_id,
        frame_ids: result.frameIds,
      },
    });

    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await updateGenerationJobStatus(supabase, {
      projectId: input.projectId,
      jobId: input.jobId,
      status: "failed",
      errorMessage: message,
      metadata: {
        ...(job.metadata || {}),
        last_error: message,
      },
    });
    await recordProjectActivity(supabase, {
      projectId: input.projectId,
      activityType: "generation_job_failed",
      title: `Generation job failed for ${job.target_label}`,
      body: message,
      actorUserId: input.user && !input.user.isAnonymous ? input.user.id : null,
      actorEmail: input.user?.email ?? null,
      metadata: { job_id: input.jobId, target_type: job.target_type, target_id: job.target_id },
    });
    return failed;
  }
}
