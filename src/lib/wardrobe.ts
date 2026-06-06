import type { SupabaseClient } from "@supabase/supabase-js";

export async function getLockedWardrobeForScene(
  supabase: SupabaseClient,
  projectId: string,
  sceneId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("description, characters!inner(name)")
    .eq("project_id", projectId)
    .eq("scene_id", sceneId)
    .eq("locked", true);

  if (error || !data) return new Map();

  const map = new Map<string, string>();
  for (const item of data as Array<{ description: string; characters: { name: string } | { name: string }[] }>) {
    const character = Array.isArray(item.characters) ? item.characters[0] : item.characters;
    const name = character?.name?.trim();
    const description = item.description?.trim();
    if (name && description) map.set(name, description);
  }
  return map;
}

export function buildWardrobePromptBlock(wardrobe: Map<string, string>): string {
  if (wardrobe.size === 0) return "";

  return [
    "WARDROBE FOR THIS SCENE:",
    ...Array.from(wardrobe.entries()).map(([name, description]) => `- ${name}: ${description}`),
    "IMPORTANT: Characters must wear exactly the wardrobe described above. Do not invent or change clothing.",
  ].join("\n");
}
