import { createRouteClient } from "@/lib/supabase-route";
import { generatePropImage } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Element registry (PROMPTING.md / round 3).
 *
 * GET  — list the project's element plan (props, outfits, environments,
 *        characters) with status: planned → image_ready → element_ready.
 * POST {action:"derive"} — scan the script data for anything that crosses
 *        scenes and plan elements for it:
 *        · props appearing in ≥2 scenes (scenes.props)
 *        · per-character outfits recurring across ≥2 scenes (scenes.wardrobe)
 *        · every location (environments)
 *        Characters are tracked on the characters table directly.
 * POST {action:"generate_image", element_id} — generate a clean reference
 *        image for a planned prop/outfit from its script description
 *        (Gemini product-reference style) → status image_ready.
 * PATCH {element_id, higgsfield_element_id} — record the created
 *        Higgsfield element (done via the MCP connector) → element_ready.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("project_elements")
    .select("id, kind, name, match_terms, description, scene_numbers, ref_image_url, higgsfield_element_id, status, created_at")
    .eq("project_id", id)
    .order("kind")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ elements: data || [] });
}

const slugify = (s: string) =>
  s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const action = (body.action as string) || "derive";
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "generate_image") {
    const elementId = body.element_id as string;
    if (!elementId) return NextResponse.json({ error: "element_id required" }, { status: 400 });
    const { data: el } = await supabase
      .from("project_elements")
      .select("id, kind, name, description")
      .eq("id", elementId)
      .eq("project_id", id)
      .single();
    if (!el) return NextResponse.json({ error: "Element not found" }, { status: 404 });

    const result = await generatePropImage(el.name, el.description, el.kind);
    if (result.url.startsWith("data:image/svg")) {
      return NextResponse.json({ error: "Reference image generation was blocked — try editing the description" }, { status: 502 });
    }
    // Upload to the public bucket so the MCP connector can import it
    const match = result.url.match(/^data:([^;]+);base64,(.+)$/);
    let publicUrl = result.url;
    if (match) {
      const path = `elements/${id}/${el.kind}-${slugify(el.name).toLowerCase()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("project-uploads")
        .upload(path, Buffer.from(match[2], "base64"), { contentType: match[1], upsert: true });
      if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
      publicUrl = supabase.storage.from("project-uploads").getPublicUrl(path).data.publicUrl;
    }
    await supabase
      .from("project_elements")
      .update({ ref_image_url: publicUrl, status: "image_ready" })
      .eq("id", el.id);
    return NextResponse.json({ success: true, element_id: el.id, ref_image_url: publicUrl });
  }

  // ── action: derive ───────────────────────────────────────────
  const [scenesRes, projectRes] = await Promise.all([
    supabase
      .from("scenes")
      .select("scene_number, props, wardrobe, location")
      .eq("project_id", id)
      .order("scene_number"),
    supabase.from("projects").select("title").eq("id", id).single(),
  ]);
  const scenes = scenesRes.data || [];
  if (scenes.length === 0) return NextResponse.json({ error: "No scenes — run extraction first" }, { status: 400 });
  const prefix = slugify((projectRes.data?.title || "PRJ").split(/\s+/).slice(0, 1).join("")) || "PRJ";

  const planned: Array<{ kind: string; name: string; match_terms: string[]; description: string; scene_numbers: number[] }> = [];

  // Props crossing scenes: normalize names, count scene occurrences
  const propScenes: Record<string, { label: string; scenes: Set<number> }> = {};
  for (const s of scenes) {
    for (const prop of s.props || []) {
      const key = prop.toLowerCase().trim();
      if (!key) continue;
      if (!propScenes[key]) propScenes[key] = { label: prop.trim(), scenes: new Set() };
      propScenes[key].scenes.add(s.scene_number);
    }
  }
  for (const [key, info] of Object.entries(propScenes)) {
    if (info.scenes.size < 2) continue; // "anything used more than once"
    planned.push({
      kind: "prop",
      name: `${prefix}-${slugify(info.label)}`,
      match_terms: [info.label, key],
      description: `${info.label} — recurring prop. Identical in every shot it appears in: same model, color, wear, and details as the reference.`,
      scene_numbers: [...info.scenes].sort((a, b) => a - b),
    });
  }

  // Outfits crossing scenes: same character with wardrobe noted in ≥2 scenes
  const outfitScenes: Record<string, { character: string; desc: string; scenes: Set<number> }> = {};
  for (const s of scenes) {
    const wardrobe = Array.isArray(s.wardrobe) ? s.wardrobe : [];
    for (const w of wardrobe as Array<{ character?: string; description?: string }>) {
      if (!w?.character || !w?.description) continue;
      const key = `${w.character.toLowerCase()}`;
      if (!outfitScenes[key]) outfitScenes[key] = { character: w.character, desc: w.description, scenes: new Set() };
      outfitScenes[key].scenes.add(s.scene_number);
    }
  }
  for (const info of Object.values(outfitScenes)) {
    if (info.scenes.size < 2) continue;
    planned.push({
      kind: "outfit",
      name: `${prefix}-${slugify(info.character)}-Outfit`,
      match_terms: [`${info.character}'s outfit`, info.desc.split(",")[0] || info.desc],
      description: `${info.character}'s outfit: ${info.desc}. Worn identically in every scene — no substitutions.`,
      scene_numbers: [...info.scenes].sort((a, b) => a - b),
    });
  }

  // Upsert planned rows (skip names that already exist)
  let inserted = 0;
  for (const p of planned) {
    const { error } = await supabase
      .from("project_elements")
      .upsert(
        { project_id: id, ...p },
        { onConflict: "project_id,kind,name", ignoreDuplicates: true }
      );
    if (!error) inserted++;
  }

  const { data: all } = await supabase
    .from("project_elements")
    .select("id, kind, name, status, scene_numbers")
    .eq("project_id", id);
  return NextResponse.json({ success: true, derived: planned.length, elements: all || [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { element_id, higgsfield_element_id } = body as { element_id?: string; higgsfield_element_id?: string };
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!element_id || !higgsfield_element_id) {
    return NextResponse.json({ error: "element_id and higgsfield_element_id required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("project_elements")
    .update({ higgsfield_element_id, status: "element_ready" })
    .eq("id", element_id)
    .eq("project_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
