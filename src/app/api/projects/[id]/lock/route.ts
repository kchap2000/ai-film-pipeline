import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/:id/lock — get characters with their approved cast + pose sheet
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [charsRes, variationsRes] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, description, role, locked, approved_cast_id, pose_sheet_url")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("cast_variations")
      .select("character_id, image_url")
      .eq("project_id", id)
      .eq("status", "approved"),
  ]);

  // Map approved variation URLs by character
  const approvedImages: Record<string, string> = {};
  for (const v of variationsRes.data || []) {
    approvedImages[v.character_id] = v.image_url;
  }

  const characters = (charsRes.data || []).map((char) => ({
    ...char,
    approved_image_url: approvedImages[char.id] || null,
  }));

  return NextResponse.json({ characters });
}

// PATCH /api/projects/:id/lock — lock a character or lock all
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { character_id, lock_all } = body;
  const supabase = getSupabase();

  if (lock_all) {
    // Lock all characters that have an approved cast
    const { data: chars } = await supabase
      .from("characters")
      .select("id")
      .eq("project_id", id)
      .not("approved_cast_id", "is", null);

    for (const char of chars || []) {
      await supabase
        .from("characters")
        .update({ locked: true })
        .eq("id", char.id);
    }

    // Check if ALL cast characters are now locked — if so advance phase
    const { data: unlocked } = await supabase
      .from("characters")
      .select("id")
      .eq("project_id", id)
      .not("approved_cast_id", "is", null)
      .eq("locked", false);

    if (!unlocked || unlocked.length === 0) {
      await supabase
        .from("projects")
        .update({ phase_status: "lock" })
        .eq("id", id);
    }

    return NextResponse.json({ success: true });
  }

  if (character_id) {
    // Lock a single character — only requires approved cast
    await supabase
      .from("characters")
      .update({ locked: true })
      .eq("id", character_id)
      .eq("project_id", id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
