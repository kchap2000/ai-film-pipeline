import { createRouteClient } from "@/lib/supabase-route";
import { generatePropImage } from "@/lib/generate-image";
import { scoreRealism } from "@/lib/realism-gate";
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

  // REVISION_VISION R5 — element versioning. new_version retires the
  // current row (active=false) and stages a fresh row (version+1, planned)
  // to regenerate; set_active flips which version of a (kind,name) element
  // the prompt engine uses.
  if (action === "new_version") {
    const elementId = body.element_id as string;
    if (!elementId) return NextResponse.json({ error: "element_id required" }, { status: 400 });
    const { data: el } = await supabase
      .from("project_elements")
      .select("*")
      .eq("id", elementId)
      .eq("project_id", id)
      .single();
    if (!el) return NextResponse.json({ error: "Element not found" }, { status: 404 });

    await supabase.from("project_elements").update({ active: false }).eq("id", el.id);
    const { data: created, error: insErr } = await supabase
      .from("project_elements")
      .insert({
        project_id: id,
        kind: el.kind,
        name: el.name,
        match_terms: el.match_terms,
        description: (body.description as string) || el.description,
        scene_numbers: el.scene_numbers,
        status: "planned",
        version: (Number(el.version) || 1) + 1,
        parent_element_id: el.id,
        active: true,
      })
      .select("id, version")
      .single();
    if (insErr) {
      // Roll the old row back to active so the element isn't orphaned
      await supabase.from("project_elements").update({ active: true }).eq("id", el.id);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, element_id: created?.id, version: created?.version });
  }

  if (action === "set_active") {
    const elementId = body.element_id as string;
    if (!elementId) return NextResponse.json({ error: "element_id required" }, { status: 400 });
    const { data: el } = await supabase
      .from("project_elements")
      .select("id, kind, name")
      .eq("id", elementId)
      .eq("project_id", id)
      .single();
    if (!el) return NextResponse.json({ error: "Element not found" }, { status: 404 });
    await supabase
      .from("project_elements")
      .update({ active: false })
      .eq("project_id", id)
      .eq("kind", el.kind)
      .eq("name", el.name)
      .neq("id", el.id);
    await supabase.from("project_elements").update({ active: true }).eq("id", el.id);
    return NextResponse.json({ success: true });
  }

  if (action === "generate_image") {
    const elementId = body.element_id as string;
    const boost = (body.realism_boost as string | undefined) || undefined;
    if (!elementId) return NextResponse.json({ error: "element_id required" }, { status: 400 });
    const { data: el } = await supabase
      .from("project_elements")
      .select("id, kind, name, description")
      .eq("id", elementId)
      .eq("project_id", id)
      .single();
    if (!el) return NextResponse.json({ error: "Element not found" }, { status: 404 });

    const result = await generatePropImage(el.name, el.description, el.kind, boost);
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
    // Realism gate: element plates feed Higgsfield elements which anchor
    // EVERY clip — score before they get that far. The orchestrator
    // re-rolls failures with realism_boost.
    const verdict = await scoreRealism(publicUrl);
    await supabase
      .from("project_elements")
      .update({ ref_image_url: publicUrl, status: "image_ready" })
      .eq("id", el.id);
    return NextResponse.json({
      success: true,
      element_id: el.id,
      ref_image_url: publicUrl,
      realism: verdict ? { score: verdict.score, style: verdict.style, issues: verdict.issues } : null,
    });
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

  // "Anything used more than once": with 2+ scenes that means props
  // crossing scenes. A single-scene script (a one-scene episode) is shot
  // as MANY panels, so every scripted prop recurs across shots — the
  // recurrence threshold drops to 1.
  const minScenes = scenes.length >= 2 ? 2 : 1;
  // "Ashen Blade (Rayne's glowing sword)" → name "Ashen Blade"; keep the
  // parenthetical as description detail.
  const splitParen = (raw: string): { label: string; detail: string | null } => {
    const m = raw.match(/^([^(]+?)\s*\(([^)]+)\)\s*$/);
    return m ? { label: m[1].trim(), detail: m[2].trim() } : { label: raw.trim(), detail: null };
  };

  const propScenes: Record<string, { label: string; detail: string | null; scenes: Set<number> }> = {};
  for (const s of scenes) {
    for (const prop of s.props || []) {
      const { label, detail } = splitParen(prop);
      const key = label.toLowerCase();
      if (!key) continue;
      if (!propScenes[key]) propScenes[key] = { label, detail, scenes: new Set() };
      propScenes[key].scenes.add(s.scene_number);
    }
  }
  for (const [key, info] of Object.entries(propScenes)) {
    if (info.scenes.size < minScenes) continue;
    planned.push({
      kind: "prop",
      name: `${prefix}-${slugify(info.label)}`,
      match_terms: Array.from(new Set([info.label, key])),
      description: `${info.label}${info.detail ? ` (${info.detail})` : ""} — recurring prop. Identical in every shot it appears in: same model, color, wear, and details as the reference.`,
      scene_numbers: [...info.scenes].sort((a, b) => a - b),
    });
  }

  // Outfits: same character with wardrobe noted across the scene threshold
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
    if (info.scenes.size < minScenes) continue;
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

  // Locations are elements too — the set recurs across every scene shot
  // there. Each approved location plate becomes an environment element row
  // that starts at image_ready (no generation needed: the approved scout
  // plate IS the reference). Fulfillment creates the Higgsfield element
  // and stamps locations.higgsfield_element_id + this row.
  const { data: locs } = await supabase
    .from("locations")
    .select("id, name, description, approved_image_url")
    .eq("project_id", id)
    .not("approved_image_url", "is", null);
  for (const loc of locs || []) {
    const name = `${prefix}-${slugify(loc.name)}-Set`;
    const { data: existing } = await supabase
      .from("project_elements")
      .select("id, status")
      .eq("project_id", id)
      .eq("kind", "environment")
      .eq("name", name)
      .maybeSingle();
    if (existing && existing.status !== "planned") continue; // already staged

    // Upload the approved plate (base64 in DB) to the public bucket
    const m = (loc.approved_image_url as string).match(/^data:([^;]+);base64,(.+)$/);
    let refUrl: string | null = loc.approved_image_url.startsWith("http") ? loc.approved_image_url : null;
    if (m && !m[1].includes("svg")) {
      const path = `elements/${id}/environment-${slugify(loc.name).toLowerCase()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("project-uploads")
        .upload(path, Buffer.from(m[2], "base64"), { contentType: m[1], upsert: true });
      if (!upErr) refUrl = supabase.storage.from("project-uploads").getPublicUrl(path).data.publicUrl;
    }
    if (!refUrl) continue;
    await supabase.from("project_elements").upsert(
      {
        project_id: id,
        kind: "environment",
        name,
        match_terms: [loc.name],
        description: `${loc.name} — the ONE canonical set${loc.description ? `: ${loc.description}` : ""}. Same architecture, set dressing, and layout in every shot. No redesign between shots.`,
        scene_numbers: [],
        ref_image_url: refUrl,
        status: "image_ready",
      },
      { onConflict: "project_id,kind,name", ignoreDuplicates: false }
    );
    inserted++;
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
