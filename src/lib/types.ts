export type ProjectType = "client" | "personal";

export type PhaseStatus =
  | "ingestion"
  | "extraction"
  | "bible"
  | "casting"
  | "lock"
  | "scene_bible"
  | "storyboard";

export const PHASE_LABELS: Record<PhaseStatus, string> = {
  ingestion: "Asset Ingestion",
  extraction: "LLM Extraction",
  bible: "Film Bible",
  casting: "AI Casting",
  lock: "Character Lock",
  scene_bible: "Scene Bible",
  storyboard: "Storyboard",
};

export const PHASE_ORDER: PhaseStatus[] = [
  "ingestion",
  "extraction",
  "bible",
  "casting",
  "lock",
  "scene_bible",
  "storyboard",
];

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  client_name: string | null;
  phase_status: PhaseStatus;
  archived: boolean;
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
  created_at: string;
}
