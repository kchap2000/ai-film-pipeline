import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhaseStatus } from "@/lib/types";
import type { RouteUser } from "@/lib/project-access";

export type DecisionStatus = "approved" | "rejected" | "needs_changes" | "commented";

export type ProjectDecisionInput = {
  projectId: string;
  decisionType: string;
  subjectType: string;
  subjectId: string;
  status: DecisionStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  user?: RouteUser | null;
};

const PHASE_RANK: Record<PhaseStatus, number> = {
  ingestion: 0,
  extraction: 1,
  bible: 2,
  casting: 3,
  lock: 4,
  scene_bible: 5,
  storyboard: 6,
  first_frames: 7,
};

async function currentPhase(supabase: SupabaseClient, projectId: string): Promise<PhaseStatus | null> {
  const { data } = await supabase
    .from("projects")
    .select("phase_status")
    .eq("id", projectId)
    .single();
  return (data?.phase_status as PhaseStatus | undefined) ?? null;
}

export async function advanceProjectPhase(
  supabase: SupabaseClient,
  projectId: string,
  targetPhase: PhaseStatus,
  reason: string
) {
  const phase = await currentPhase(supabase, projectId);
  if (!phase || PHASE_RANK[phase] >= PHASE_RANK[targetPhase]) {
    return { advanced: false, phase };
  }

  const { error } = await supabase
    .from("projects")
    .update({ phase_status: targetPhase })
    .eq("id", projectId);

  if (!error) {
    await recordProjectActivity(supabase, {
      projectId,
      activityType: "phase_advanced",
      title: `Moved to ${targetPhase.replace("_", " ")}`,
      body: reason,
      metadata: { from: phase, to: targetPhase },
    });
  }

  return { advanced: !error, phase: error ? phase : targetPhase };
}

export async function recordProjectActivity(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    activityType: string;
    title: string;
    body?: string | null;
    actorUserId?: string | null;
    actorEmail?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("project_activity").insert({
    project_id: input.projectId,
    activity_type: input.activityType,
    title: input.title,
    body: input.body ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_email: input.actorEmail ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function recordProjectDecision(
  supabase: SupabaseClient,
  input: ProjectDecisionInput
) {
  const { data } = await supabase
    .from("project_decisions")
    .insert({
      project_id: input.projectId,
      decision_type: input.decisionType,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      status: input.status,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      decided_by: input.user && !input.user.isAnonymous ? input.user.id : null,
      decided_by_email: input.user?.email ?? null,
    })
    .select("id")
    .single();

  await recordProjectActivity(supabase, {
    projectId: input.projectId,
    activityType: "decision_recorded",
    title: `${input.decisionType.replace("_", " ")} ${input.status}`,
    body: input.notes ?? null,
    actorUserId: input.user && !input.user.isAnonymous ? input.user.id : null,
    actorEmail: input.user?.email ?? null,
    metadata: {
      decision_id: data?.id ?? null,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      status: input.status,
      ...input.metadata,
    },
  });

  return data?.id ?? null;
}

function allDone(done: number, total: number) {
  return total > 0 && done >= total;
}

export async function evaluateProjectAutomation(
  supabase: SupabaseClient,
  projectId: string
) {
  const [charsRes, locationsRes, scenesRes, panelsRes, framesRes] = await Promise.all([
    supabase
      .from("characters")
      .select("id, approved_cast_id, locked, voice_only")
      .eq("project_id", projectId),
    supabase
      .from("locations")
      .select("id, approved_image_url, locked")
      .eq("project_id", projectId),
    supabase
      .from("scenes")
      .select("id, approved_scout_image_url, locked")
      .eq("project_id", projectId),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id, approved_first_frame_id")
      .eq("project_id", projectId),
    supabase
      .from("first_frames")
      .select("id, panel_id, status")
      .eq("project_id", projectId)
      .neq("status", "replaced"),
  ]);

  const castable = (charsRes.data || []).filter((c) => !c.voice_only);
  const castApproved = castable.filter((c) => c.approved_cast_id).length;
  const castLocked = castable.filter((c) => c.approved_cast_id && c.locked).length;

  const locations = locationsRes.data || [];
  const locationsApproved = locations.filter((l) => l.approved_image_url).length;

  const scenes = scenesRes.data || [];
  const scenesScouted = scenes.filter((s) => s.approved_scout_image_url).length;

  const panels = panelsRes.data || [];
  const sceneIdsWithPanels = new Set(panels.map((p) => p.scene_id));
  const scenesWithPanels = scenes.filter((s) => sceneIdsWithPanels.has(s.id)).length;
  const framePanelIds = new Set((framesRes.data || []).map((f) => f.panel_id));
  const panelsWithFrames = panels.filter((p) => framePanelIds.has(p.id)).length;
  const approvedFrames = panels.filter((p) => p.approved_first_frame_id).length;

  let targetPhase: PhaseStatus | null = null;
  let reason = "";
  if (allDone(approvedFrames, panels.length)) {
    targetPhase = "first_frames";
    reason = "All first frames have been approved.";
  } else if (allDone(panelsWithFrames, panels.length)) {
    targetPhase = "first_frames";
    reason = "All storyboard panels have active first-frame candidates.";
  } else if (allDone(scenesWithPanels, scenes.length)) {
    targetPhase = "storyboard";
    reason = "Every scene has storyboard panels.";
  } else if (allDone(scenesScouted, scenes.length)) {
    targetPhase = "storyboard";
    reason = "Every scene has an approved scout image.";
  } else if (allDone(locationsApproved, locations.length)) {
    targetPhase = "scene_bible";
    reason = "Every location has an approved reference image.";
  } else if (allDone(castLocked, castable.length)) {
    targetPhase = "scene_bible";
    reason = "All cast characters are locked and ready for location/scene scouting.";
  } else if (allDone(castApproved, castable.length)) {
    targetPhase = "lock";
    reason = "All cast characters have approved headshots.";
  }

  const advance = targetPhase
    ? await advanceProjectPhase(supabase, projectId, targetPhase, reason)
    : { advanced: false, phase: await currentPhase(supabase, projectId) };

  return {
    ...advance,
    targetPhase,
    checks: {
      cast_approved: { done: castApproved, total: castable.length, ok: allDone(castApproved, castable.length) },
      cast_locked: { done: castLocked, total: castable.length, ok: allDone(castLocked, castable.length) },
      locations_approved: { done: locationsApproved, total: locations.length, ok: allDone(locationsApproved, locations.length) },
      scenes_scouted: { done: scenesScouted, total: scenes.length, ok: allDone(scenesScouted, scenes.length) },
      scenes_have_panels: { done: scenesWithPanels, total: scenes.length, ok: allDone(scenesWithPanels, scenes.length) },
      first_frames_generated: { done: panelsWithFrames, total: panels.length, ok: allDone(panelsWithFrames, panels.length) },
      first_frames_approved: { done: approvedFrames, total: panels.length, ok: allDone(approvedFrames, panels.length) },
    },
  };
}
