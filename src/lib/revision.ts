/**
 * REVISION_VISION.md — shared Revision Engine types + helpers.
 *
 * A RevisionPlan is the structured output of resolving human feedback
 * (Screening Room notes, dictated or typed) or a hub action (recast, swap)
 * into concrete regen targets. Both the revisions API (resolver) and the
 * auto-pipeline orchestrator (run_type 'revision') consume these shapes.
 */

export type RevisionAction =
  | "reframe"               // regenerate first frame(s) only
  | "reclip"                // regenerate video clip(s) only, frame untouched
  | "reframe_and_reclip"    // regenerate frame(s) then clip(s)
  | "recast"                // unlock + re-cast a character, then cascade
  | "swap_location_image"   // promote a different location variation
  | "swap_scene_image"      // promote a different scene scout variation
  | "element_fix"           // regenerate an element reference (new version)
  | "edit_panel"            // metadata edit on a storyboard panel
  | "edit_character"        // metadata edit on a character
  | "edit_scene";           // metadata edit on a scene

export interface RevisionTarget {
  action: RevisionAction;
  /** resolved shot targets (storyboard panel ids) */
  panel_ids?: string[];
  scene_id?: string;
  character_id?: string;
  location_id?: string;
  element_id?: string;
  /** for swaps: which existing variation to promote */
  variation_id?: string;
  /** distilled human note — injected into regen prompts as an addendum */
  correction: string;
  /** optional custom motion prompt for reclip targets */
  motion_override?: string;
  /** metadata edits for edit_* actions, e.g. { mood: "warmer" } */
  updates?: Record<string, string>;
}

export interface RevisionPlan {
  targets: RevisionTarget[];
  /** human-readable "here's what I'll do" shown in the confirm UI */
  summary: string;
  estimated_units: { frames: number; clips: number };
  /** durable lessons to record (project scope unless prefixed "GLOBAL: ") */
  lessons: string[];
}

export type RevisionStatus =
  | "draft"
  | "planned"
  | "approved"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface RawFeedbackNote {
  text: string;
  clip_id?: string | null;
  panel_id?: string | null;
  scene_number?: number | null;
  timestamp_s?: number | null;
  via: "typed" | "dictated" | "hub_action";
}

export interface RevisionRow {
  id: string;
  project_id: string;
  source_assembly_id: string | null;
  status: RevisionStatus;
  raw_feedback: RawFeedbackNote[];
  plan: RevisionPlan | null;
  result_assembly_id: string | null;
  pipeline_run_id: string | null;
  qa_verify: { score: number; notes: string } | null;
  created_at: string;
  updated_at: string;
}

const VALID_ACTIONS: RevisionAction[] = [
  "reframe",
  "reclip",
  "reframe_and_reclip",
  "recast",
  "swap_location_image",
  "swap_scene_image",
  "element_fix",
  "edit_panel",
  "edit_character",
  "edit_scene",
];

/**
 * Validate + normalize a plan coming back from the Claude resolver (or a
 * hub action builder). Drops malformed targets rather than failing the
 * whole plan; returns null only when nothing actionable survives.
 */
export function validatePlan(raw: unknown): RevisionPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const targetsIn = Array.isArray(obj.targets) ? obj.targets : [];
  const targets: RevisionTarget[] = [];

  for (const t of targetsIn) {
    if (!t || typeof t !== "object") continue;
    const tt = t as Record<string, unknown>;
    const action = tt.action as RevisionAction;
    if (!VALID_ACTIONS.includes(action)) continue;
    const correction = typeof tt.correction === "string" ? tt.correction : "";
    const panelIds = Array.isArray(tt.panel_ids)
      ? (tt.panel_ids as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0)
      : undefined;

    // Each action needs its subject
    const needsPanels = ["reframe", "reclip", "reframe_and_reclip", "edit_panel"].includes(action);
    if (needsPanels && (!panelIds || panelIds.length === 0) && !tt.scene_id) continue;
    if (action === "recast" && !tt.character_id) continue;
    if (action === "swap_location_image" && !(tt.location_id && tt.variation_id)) continue;
    if (action === "swap_scene_image" && !(tt.scene_id && tt.variation_id)) continue;
    if (action === "element_fix" && !tt.element_id) continue;
    if (action === "edit_character" && !tt.character_id) continue;
    if (action === "edit_scene" && !tt.scene_id) continue;

    targets.push({
      action,
      panel_ids: panelIds,
      scene_id: typeof tt.scene_id === "string" ? tt.scene_id : undefined,
      character_id: typeof tt.character_id === "string" ? tt.character_id : undefined,
      location_id: typeof tt.location_id === "string" ? tt.location_id : undefined,
      element_id: typeof tt.element_id === "string" ? tt.element_id : undefined,
      variation_id: typeof tt.variation_id === "string" ? tt.variation_id : undefined,
      correction,
      motion_override: typeof tt.motion_override === "string" ? tt.motion_override : undefined,
      updates:
        tt.updates && typeof tt.updates === "object" && !Array.isArray(tt.updates)
          ? (tt.updates as Record<string, string>)
          : undefined,
    });
  }

  if (targets.length === 0) return null;

  return {
    targets,
    summary: typeof obj.summary === "string" ? obj.summary : "Revision plan",
    estimated_units: estimateUnits(targets),
    lessons: Array.isArray(obj.lessons)
      ? (obj.lessons as unknown[]).filter((l): l is string => typeof l === "string")
      : [],
  };
}

/** Frames/clips the plan will regenerate — drives the confirm-UI cost preview. */
export function estimateUnits(targets: RevisionTarget[]): { frames: number; clips: number } {
  let frames = 0;
  let clips = 0;
  for (const t of targets) {
    const n = t.panel_ids?.length || 0;
    switch (t.action) {
      case "reframe":
        frames += n;
        break;
      case "reclip":
        clips += n;
        break;
      case "reframe_and_reclip":
        frames += n;
        clips += n;
        break;
      case "recast":
        // cascade cost is computed when the plan is resolved (panel_ids
        // carry the affected shots); count whatever was resolved
        frames += n;
        clips += n;
        break;
      case "swap_location_image":
      case "swap_scene_image":
      case "element_fix":
        frames += n;
        clips += n;
        break;
      default:
        break;
    }
  }
  return { frames, clips };
}

/**
 * Flatten a plan into the orchestrator's regen cursors.
 * - framePanelIds: panels whose first frame must regenerate
 * - clipPanelIds: panels whose clip must regenerate
 * - corrections: panel_id → addendum text injected into the regen prompt
 */
export function planToCursors(plan: RevisionPlan): {
  framePanelIds: string[];
  clipPanelIds: string[];
  corrections: Record<string, string>;
  motionOverrides: Record<string, string>;
} {
  const framePanelIds = new Set<string>();
  const clipPanelIds = new Set<string>();
  const corrections: Record<string, string> = {};
  const motionOverrides: Record<string, string> = {};

  for (const t of plan.targets) {
    const panels = t.panel_ids || [];
    const wantsFrames = ["reframe", "reframe_and_reclip", "recast", "swap_location_image", "swap_scene_image", "element_fix"].includes(t.action);
    const wantsClips = ["reclip", "reframe_and_reclip", "recast", "swap_location_image", "swap_scene_image", "element_fix"].includes(t.action);
    for (const p of panels) {
      if (wantsFrames) framePanelIds.add(p);
      if (wantsClips) clipPanelIds.add(p);
      if (t.correction) {
        corrections[p] = corrections[p] ? `${corrections[p]}\n${t.correction}` : t.correction;
      }
      if (t.motion_override) motionOverrides[p] = t.motion_override;
    }
  }

  return {
    framePanelIds: Array.from(framePanelIds),
    clipPanelIds: Array.from(clipPanelIds),
    corrections,
    motionOverrides,
  };
}
