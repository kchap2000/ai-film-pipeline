import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/:id/bible — get all extraction data for the Film Bible
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [projectRes, charsRes, scenesRes, extractionRes, castsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("characters")
      .select("*, pose_sheet_url")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("scenes")
      .select("*")
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
      .select("id, character_id, image_url")
      .eq("project_id", id)
      .eq("status", "approved"),
  ]);

  if (projectRes.error) {
    return NextResponse.json(
      { error: projectRes.error.message },
      { status: 404 }
    );
  }

  // Build a map of character_id → approved headshot URL
  const headshotByCharId: Record<string, string> = {};
  for (const cv of castsRes.data || []) {
    headshotByCharId[cv.character_id] = cv.image_url;
  }

  const characters = (charsRes.data || []).map((char) => ({
    ...char,
    headshot_url: headshotByCharId[char.id] || null,
  }));

  return NextResponse.json({
    project: projectRes.data,
    characters,
    scenes: scenesRes.data || [],
    extraction: extractionRes.data || null,
  });
}

// PATCH /api/projects/:id/bible — update a character's description, role, or voice_only flag
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { character_id, description, role, personality, voice_only } = body;

  if (!character_id) {
    return NextResponse.json({ error: "character_id is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Build update payload from whatever fields were provided
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, character: data });
}

// POST /api/projects/:id/bible — approve the bible and advance phase
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const { error } = await supabase
    .from("projects")
    .update({ phase_status: "bible" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, phase_status: "bible" });
}
