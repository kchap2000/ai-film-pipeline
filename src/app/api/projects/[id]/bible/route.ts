import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/:id/bible — get all extraction data for the Film Bible
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [projectRes, charsRes, scenesRes, extractionRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("characters")
      .select("*")
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
  ]);

  if (projectRes.error) {
    return NextResponse.json(
      { error: projectRes.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    project: projectRes.data,
    characters: charsRes.data || [],
    scenes: scenesRes.data || [],
    extraction: extractionRes.data || null,
  });
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
