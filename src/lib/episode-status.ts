/**
 * episode-status.ts — the ONE definition of "how done is this episode".
 *
 * phase_status only spans ingestion→first_frames. A real series view needs the
 * full ladder through video, assembly, and QA. computeEpisodeStatus derives the
 * true stage from concrete signals (panels, approved frames, completed clips,
 * an assembled full video, a QA score). Used by the project card AND series
 * tiles so "complete" means the same thing everywhere: assembled + QA'd.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EPISODE_STAGE_LABELS,
  EPISODE_STAGE_ORDER,
  type EpisodeStage,
  type EpisodeStatus,
  type PhaseStatus,
} from "@/lib/types";

export interface EpisodeSignals {
  phaseStatus: PhaseStatus;
  panelCount: number;
  approvedFrameCount: number;
  completedClipCount: number;
  /** an assembled full video exists and is ready (watchable) */
  assembledReady: boolean;
  qaScore: number | null;
  thumbnailFrameId: string | null;
}

/** Map the early phase_status values onto the episode ladder. */
function stageFromPhase(phase: PhaseStatus): EpisodeStage {
  switch (phase) {
    case "ingestion":
      return "ingested";
    case "extraction":
    case "bible":
      return "extracted";
    case "casting":
    case "lock":
    case "scene_bible":
      return "cast";
    case "storyboard":
      return "storyboard";
    case "first_frames":
      return "first_frames";
    default:
      return "ingested";
  }
}

export function computeEpisodeStatus(s: EpisodeSignals): EpisodeStatus {
  let stage: EpisodeStage;
  // Downstream signals win over phase_status (which never advances past
  // first_frames). Walk the ladder from the top.
  if (s.assembledReady && s.qaScore != null) stage = "complete";
  else if (s.assembledReady) stage = "assembled";
  else if (s.completedClipCount > 0) stage = "clips";
  else if (s.panelCount > 0 && s.approvedFrameCount >= s.panelCount) stage = "first_frames";
  else if (s.panelCount > 0) stage = "storyboard";
  else stage = stageFromPhase(s.phaseStatus);

  const idx = EPISODE_STAGE_ORDER.indexOf(stage);
  const pct = Math.round(((idx + 1) / EPISODE_STAGE_ORDER.length) * 100);

  // Richer label when we have partial progress inside a stage.
  let label: string = EPISODE_STAGE_LABELS[stage];
  if (stage === "first_frames" && s.panelCount > 0)
    label = `Key frames ${s.approvedFrameCount}/${s.panelCount}`;
  else if (stage === "storyboard" && s.panelCount > 0)
    label = `Storyboard · ${s.panelCount} shots`;
  else if (stage === "clips" && s.panelCount > 0)
    label = `Clips ${s.completedClipCount}/${s.panelCount}`;
  else if (stage === "complete" && s.qaScore != null)
    label = `Complete · QA ${Math.round(s.qaScore)}/100`;

  return {
    stage,
    pct,
    label,
    qaScore: s.qaScore,
    watchable: s.assembledReady,
    thumbnailFrameId: s.thumbnailFrameId,
  };
}

/**
 * Gather the signals for a project and compute its episode status. All count
 * queries are head-only (no base64 — CLAUDE.md). The thumbnail is the approved
 * first frame of the earliest panel (served lazily via /first-frames/image).
 */
export async function loadEpisodeStatus(
  supabase: SupabaseClient,
  project: { id: string; phase_status: PhaseStatus }
): Promise<EpisodeStatus> {
  const projectId = project.id;
  const [panelsRes, approvedRes, clipRowsRes, asmRes, thumbRes] = await Promise.all([
    supabase.from("storyboard_panels").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase
      .from("storyboard_panels")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .not("approved_first_frame_id", "is", null),
    // Count COVERED PANELS, not clip rows — one sequence clip absorbs up to 3
    // panels (covered_panel_ids), so a row count under-reports coverage.
    supabase
      .from("video_clips")
      .select("panel_id, covered_panel_ids")
      .eq("project_id", projectId)
      .in("status", ["completed", "approved"]),
    supabase
      .from("assembled_videos")
      .select("id, clip_count, status")
      .eq("project_id", projectId)
      .eq("scope", "full")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("storyboard_panels")
      .select("approved_first_frame_id")
      .eq("project_id", projectId)
      .not("approved_first_frame_id", "is", null)
      .order("panel_number", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const coveredPanels = new Set<string>();
  for (const c of clipRowsRes.data || []) {
    if (c.panel_id) coveredPanels.add(c.panel_id as string);
    for (const p of (c.covered_panel_ids as string[] | null) || []) coveredPanels.add(p);
  }

  // QA must reflect the CURRENT assembly, not the latest QA row overall — else
  // a fresh re-assembly pairs with a stale score (or vice versa).
  let qaScore: number | null = null;
  if (asmRes.data) {
    const { data: qa } = await supabase
      .from("qa_reports")
      .select("overall_score")
      .eq("assembled_video_id", asmRes.data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    qaScore = qa?.overall_score != null ? Number(qa.overall_score) : null;
  }

  return computeEpisodeStatus({
    phaseStatus: project.phase_status,
    panelCount: panelsRes.count || 0,
    approvedFrameCount: approvedRes.count || 0,
    completedClipCount: coveredPanels.size,
    assembledReady: !!(asmRes.data && (asmRes.data.clip_count || 0) > 0),
    qaScore,
    thumbnailFrameId: (thumbRes.data?.approved_first_frame_id as string) || null,
  });
}
