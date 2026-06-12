export type ProjectType = "client" | "personal";

export const PROJECT_ASPECT_RATIO_OPTIONS = [
  {
    value: "9:16",
    label: "9:16 Vertical",
    shortLabel: "9:16",
    description: "Microdramas, Reels, TikTok, Shorts",
    css: "9 / 16",
  },
  {
    value: "16:9",
    label: "16:9 Widescreen",
    shortLabel: "16:9",
    description: "YouTube, web, standard horizontal film",
    css: "16 / 9",
  },
  {
    value: "2.39:1",
    label: "2.39:1 Cinematic",
    shortLabel: "2.39",
    description: "Anamorphic and theatrical widescreen",
    css: "2.39 / 1",
  },
  {
    value: "1:1",
    label: "1:1 Square",
    shortLabel: "1:1",
    description: "Square social and pitch-board exports",
    css: "1 / 1",
  },
] as const;

export type ProjectAspectRatio = typeof PROJECT_ASPECT_RATIO_OPTIONS[number]["value"];

export const LEGACY_PROJECT_ASPECT_RATIO: ProjectAspectRatio = "16:9";
export const DEFAULT_NEW_PROJECT_ASPECT_RATIO: ProjectAspectRatio = "9:16";

export function isProjectAspectRatio(value: unknown): value is ProjectAspectRatio {
  return PROJECT_ASPECT_RATIO_OPTIONS.some((option) => option.value === value);
}

export function normalizeProjectAspectRatio(
  value: unknown,
  fallback: ProjectAspectRatio = LEGACY_PROJECT_ASPECT_RATIO
): ProjectAspectRatio {
  return isProjectAspectRatio(value) ? value : fallback;
}

export function aspectRatioToCss(value: unknown): string {
  const ratio = normalizeProjectAspectRatio(value);
  return PROJECT_ASPECT_RATIO_OPTIONS.find((option) => option.value === ratio)?.css || "16 / 9";
}

export function aspectRatioLabel(value: unknown): string {
  const ratio = normalizeProjectAspectRatio(value);
  return PROJECT_ASPECT_RATIO_OPTIONS.find((option) => option.value === ratio)?.label || "16:9 Widescreen";
}

export type PhaseStatus =
  | "ingestion"
  | "extraction"
  | "bible"
  | "casting"
  | "lock"
  | "scene_bible"
  | "storyboard"
  | "first_frames";

export const PHASE_LABELS: Record<PhaseStatus, string> = {
  ingestion: "Asset Ingestion",
  extraction: "LLM Extraction",
  bible: "Film Bible",
  casting: "AI Casting",
  lock: "Character Lock",
  scene_bible: "Scene Bible",
  storyboard: "Storyboard",
  first_frames: "First Frames",
};

export const PHASE_ORDER: PhaseStatus[] = [
  "ingestion",
  "extraction",
  "bible",
  "casting",
  "lock",
  "scene_bible",
  "storyboard",
  "first_frames",
];

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  client_name: string | null;
  phase_status: PhaseStatus;
  archived: boolean;
  aspect_ratio: ProjectAspectRatio;
  production_notes: string;
  mode: ProjectMode;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_at: string;
}

export type CharacterRole = "lead" | "supporting" | "minor" | "extra" | "mentioned";

export interface Character {
  id: string;
  project_id: string;
  name: string;
  description: string;
  role: CharacterRole;
  personality: string;
  voice_only: boolean;
  approved_cast_id: string | null;
  locked: boolean;
  /** Higgsfield reference-element ID (identity lock for video generation) */
  higgsfield_element_id: string | null;
  version: number;
  created_at: string;
}

export type CastVariationStatus = "pending" | "approved" | "rejected" | "superseded";

export interface CastVariation {
  id: string;
  character_id: string;
  project_id: string;
  image_url: string;
  storage_path: string | null;
  prompt_used: string;
  status: CastVariationStatus;
  rejection_note: string | null;
  variation_number: number;
  created_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  location: string;
  time_of_day: string;
  scene_type: "real" | "dream" | "fantasy" | "flashback" | "montage";
  action_summary: string;
  mood: string;
  props: string[];
  wardrobe: { character: string; description: string }[];
  characters_present: string[];
  locked: boolean;
  approved_scout_image_url: string | null;
  version: number;
  created_at: string;
}

export interface Location {
  id: string;
  project_id: string;
  name: string;
  description: string;
  time_of_day: string;
  mood: string;
  locked: boolean;
  approved_image_url: string | null;
  /** Higgsfield reference-element ID (set lock for video generation) */
  higgsfield_element_id: string | null;
  version: number;
  created_at: string;
}

export type AssetType =
  | "project"
  | "character"
  | "location"
  | "scene"
  | "storyboard_panel"
  | "first_frame"
  | "cast_variation"
  | "location_variation"
  | "scene_variation"
  | "pose_sheet"
  | "video_clip"
  | "assembled_video";

export type SourceType = "project" | "character" | "location" | "scene" | "storyboard_panel";

export interface AssetProvenance {
  id: string;
  project_id: string;
  asset_type: AssetType;
  asset_id: string;
  source_type: SourceType;
  source_id: string;
  source_version: number;
  relationship: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface StaleAsset {
  asset_type: AssetType;
  asset_id: string;
  source_type: SourceType;
  source_id: string;
  source_version: number;
  current_version: number | null;
  relationship: string | null;
  is_missing_source: boolean;
}

export type GenerationJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type GenerationJobAction = "generate" | "regenerate" | "replace" | "export";
export type GenerationJobType =
  | "first_frame_generation"
  | "first_frame_regeneration"
  | "storyboard_generation"
  | "scene_scout_generation"
  | "location_generation"
  | "cast_generation"
  | "pose_sheet_generation"
  | "wardrobe_generation"
  | "prop_generation";

export interface GenerationJob {
  id: string;
  project_id: string;
  job_type: GenerationJobType;
  action: GenerationJobAction;
  target_type: AssetType | "prop" | "outfit";
  target_id: string | null;
  target_label: string;
  status: GenerationJobStatus;
  priority: "minor" | "important" | "must_follow";
  prompt: string;
  source_feedback_id: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  started_by: string | null;
  started_by_email: string | null;
  result_asset_type: AssetType | null;
  result_asset_ids: string[];
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

// ── FINAL VISION: modes, video pipeline, QA ─────────────────────

export type ProjectMode = "auto" | "manual";

export type PipelineStep =
  | "revision_edits"
  | "extract"
  | "cast_generate"
  | "cast_select"
  | "pose_sheets"
  | "locations_generate"
  | "locations_select"
  | "scenes_generate"
  | "scenes_select"
  | "storyboard"
  | "elements"
  | "first_frames"
  | "video_clips"
  | "assemble"
  | "qa"
  | "done";

export const PIPELINE_STEP_ORDER: PipelineStep[] = [
  "extract",
  "cast_generate",
  "cast_select",
  "pose_sheets",
  "locations_generate",
  "locations_select",
  "scenes_generate",
  "scenes_select",
  "storyboard",
  "elements",
  "first_frames",
  "video_clips",
  "assemble",
  "qa",
  "done",
];

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  revision_edits: "Revision — Apply Edits",
  extract: "Script Extraction",
  cast_generate: "Casting — Generate Variations",
  cast_select: "Casting — Auto-Select & Lock",
  pose_sheets: "Pose Sheets",
  locations_generate: "Locations — Generate",
  locations_select: "Locations — Auto-Select",
  scenes_generate: "Scene Scouts — Generate",
  scenes_select: "Scene Scouts — Auto-Select",
  storyboard: "Storyboard Breakdown",
  elements: "Element Registry",
  first_frames: "First Frames",
  video_clips: "Video Generation",
  assemble: "Video Assembly",
  qa: "QA Beat Analysis",
  done: "Complete",
};

export interface PipelineRun {
  id: string;
  project_id: string;
  mode: ProjectMode;
  current_step: PipelineStep;
  progress: Record<string, unknown>;
  status: "running" | "paused" | "completed" | "failed";
  phase_timings: Record<string, number>;
  error_log: Array<{ step: string; error: string; at: string }>;
  qa_loops_completed: number;
  /** 'full' = normal pipeline; 'revision' = targeted feedback run (REVISION_VISION) */
  run_type: "full" | "revision";
  revision_id: string | null;
  started_at: string;
  completed_at: string | null;
}

export type VideoClipStatus = "pending" | "generating" | "completed" | "failed" | "approved";

export interface VideoClip {
  id: string;
  project_id: string;
  panel_id: string;
  first_frame_id: string | null;
  higgsfield_job_id: string | null;
  status: VideoClipStatus;
  video_url: string | null;
  duration_seconds: number | null;
  model_used: string;
  prompt_used: string;
  motion_description: string | null;
  retry_count: number;
  parent_clip_id: string | null;
  created_at: string;
}

export interface AssembledVideo {
  id: string;
  project_id: string;
  scope: "scene" | "full";
  scene_id: string | null;
  video_url: string | null;
  manifest: Array<{ clip_id: string; video_url: string; duration: number | null; scene_number: number; panel_number: number }>;
  duration_seconds: number | null;
  clip_count: number;
  status: "pending" | "ready" | "failed";
  /** REVISION_VISION R1 — film versioning */
  version: number;
  label: string | null;
  parent_assembly_id: string | null;
  revision_id: string | null;
  changelog: Array<{ panel_id?: string; action: string; reason: string }> | null;
  created_at: string;
}

export interface QAReport {
  id: string;
  project_id: string;
  assembled_video_id: string | null;
  overall_score: number | null;
  beat_accuracy: Array<{ scene_number: number; score: number; notes: string }>;
  character_flags: Array<{ character: string; issue: string; shots: string[] }>;
  mood_flags: Array<{ scene_number: number; expected: string; observed: string }>;
  regen_targets: Array<{ panel_id: string; scene_number: number; panel_number: number; reason: string }>;
  created_at: string;
}
