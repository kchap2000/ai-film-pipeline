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
  version: number;
  created_at: string;
}

export type CastVariationStatus = "pending" | "approved" | "rejected";

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
  | "pose_sheet";

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
