import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/:id/bible — get all extraction data for the Film Bible
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [projectRes, charsRes, scenesRes, extractionRes, castsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("characters")
      .select("id, name, description, role, personality, approved_cast_id, locked, voice_only")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("scenes")
      .select("id, project_id, scene_number, location, time_of_day, mood, action_summary, characters_present, props, wardrobe, locked, scene_type")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("extractions")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("cast_variations")
      .select("id, character_id, variation_number, status")
      .eq("project_id", id)
      .eq("status", "approved"),
  ]);

  if (projectRes.error) {
    return NextResponse.json(
      { error: projectRes.error.message },
      { status: 404 }
    );
  }

  // Build a map of character_id → approved variation ID (images lazy-loaded by UI)
  const approvedVarByCharId: Record<string, string> = {};
  for (const cv of castsRes.data || []) {
    approvedVarByCharId[cv.character_id] = cv.id;
  }

  const characters = (charsRes.data || []).map((char) => ({
    ...char,
    approved_variation_id: approvedVarByCharId[char.id] || null,
  }));

  return NextResponse.json({
    project: projectRes.data,
    characters,
    scenes: scenesRes.data || [],
    extraction: extractionRes.data || null,
  });
}

// PATCH /api/projects/:id/bible — update a character or scene
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Character update ──────────────────────────────────────
  if (body.character_id) {
    const { character_id, description, role, personality, voice_only } = body;
    const update: Record<string, unknown> = {};
    if (description !== undefined) update.description = description;
    if (role !== undefined) update.role = role;
    if (personality !== undefined) update.personality = personality;
    if (voice_only !== undefined) update.voice_only = voice_only;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("characters")
      .update(update)
      .eq("id", character_id)
      .eq("project_id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, character: data });
  }

  // ── Scene update ──────────────────────────────────────────
  if (body.scene_id) {
    const { scene_id, location, time_of_day, mood, action_summary, scene_type } = body;
    const update: Record<string, unknown> = {};
    if (location !== undefined) update.location = location;
    if (time_of_day !== undefined) update.time_of_day = time_of_day;
    if (mood !== undefined) update.mood = mood;
    if (action_summary !== undefined) update.action_summary = action_summary;
    if (scene_type !== undefined) update.scene_type = scene_type;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("scenes")
      .update(update)
      .eq("id", scene_id)
      .eq("project_id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, scene: data });
  }

  return NextResponse.json({ error: "character_id or scene_id is required" }, { status: 400 });
}

// POST /api/projects/:id/bible — approve the bible and advance phase
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("projects")
    .update({ phase_status: "bible" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, phase_status: "bible" });
}
