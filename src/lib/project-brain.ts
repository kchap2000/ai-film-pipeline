import type { SupabaseClient } from "@supabase/supabase-js";

export const BRAIN_TARGET_TYPES = [
  "project",
  "character",
  "cast_variation",
  "pose_sheet",
  "location",
  "location_variation",
  "scene",
  "scene_variation",
  "storyboard_panel",
  "first_frame",
  "prop",
  "outfit",
] as const;

export type BrainTargetType = typeof BRAIN_TARGET_TYPES[number];

export const BRAIN_INTENTS = [
  "feedback",
  "regenerate",
  "continuity_rule",
  "client_comment",
  "approval_blocker",
] as const;

export type BrainIntent = typeof BRAIN_INTENTS[number];

export const BRAIN_PRIORITIES = ["minor", "important", "must_follow"] as const;
export type BrainPriority = typeof BRAIN_PRIORITIES[number];

export const CONTINUITY_CATEGORIES = [
  "vision",
  "identity",
  "wardrobe",
  "props",
  "location",
  "lighting",
  "camera",
  "composition",
  "performance",
  "tone",
  "continuity",
] as const;

export type ContinuityCategory = typeof CONTINUITY_CATEGORIES[number];

export function normalizeBrainTargetType(value: unknown): BrainTargetType {
  return BRAIN_TARGET_TYPES.includes(value as BrainTargetType)
    ? (value as BrainTargetType)
    : "project";
}

export function normalizeBrainIntent(value: unknown): BrainIntent {
  return BRAIN_INTENTS.includes(value as BrainIntent)
    ? (value as BrainIntent)
    : "feedback";
}

export function normalizeBrainPriority(value: unknown): BrainPriority {
  return BRAIN_PRIORITIES.includes(value as BrainPriority)
    ? (value as BrainPriority)
    : "important";
}

export function normalizeContinuityCategory(value: unknown): ContinuityCategory {
  return CONTINUITY_CATEGORIES.includes(value as ContinuityCategory)
    ? (value as ContinuityCategory)
    : "continuity";
}

export function brainTargetLabel(type: BrainTargetType, label?: string | null) {
  if (label?.trim()) return label.trim();
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getProjectBrainPrompt(
  supabase: SupabaseClient,
  projectId: string,
  options: {
    targetType?: BrainTargetType;
    targetId?: string | null;
    characterNames?: string[];
    sceneId?: string | null;
  } = {}
): Promise<string> {
  const { data: rules } = await supabase
    .from("project_continuity_rules")
    .select("scope_type, scope_id, scope_label, category, rule_text, strength")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("strength", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(80);

  const targetType = options.targetType || "project";
  const targetId = options.targetId || null;
  const characterNames = new Set((options.characterNames || []).map((name) => name.toLowerCase()));

  const relevant = (rules || []).filter((rule) => {
    if (rule.scope_type === "project") return true;
    if (targetId && rule.scope_type === targetType && rule.scope_id === targetId) return true;
    if (options.sceneId && rule.scope_type === "scene" && rule.scope_id === options.sceneId) return true;
    if (rule.scope_type === "character" && rule.scope_label) {
      return characterNames.has(String(rule.scope_label).toLowerCase());
    }
    return false;
  });

  if (relevant.length === 0) return "";

  const lines = relevant.map((rule) => {
    const label = rule.scope_label ? `${rule.scope_label} ` : "";
    const strength = rule.strength === "must_follow" ? "MUST FOLLOW" : String(rule.strength || "important").toUpperCase();
    return `- ${strength}: ${label}[${rule.category}] ${rule.rule_text}`;
  });

  return [
    "PROJECT BRAIN CONTINUITY MEMORY:",
    "Apply these approved continuity rules before any generic style guidance:",
    ...lines,
  ].join("\n");
}
