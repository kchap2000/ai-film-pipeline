import { getSupabase } from "@/lib/supabase";
import { generatePoseImage } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

const POSE_TYPES = ["front", "three_quarter", "profile"] as const;

// GET /api/projects/:id/lock — get characters with their poses
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [charsRes, posesRes, variationsRes] = await Promise.all([
    supabase
      .from("characters")
      .select("*")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("character_poses")
      .select("*")
      .eq("project_id", id)
      .order("pose_type", { ascending: true }),
    supabase
      .from("cast_variations")
      .select("*")
      .eq("project_id", id)
      .eq("status", "approved"),
  ]);

  // Group poses by character_id
  const posesByCharacter: Record<string, typeof posesRes.data> = {};
  for (const p of posesRes.data || []) {
    if (!posesByCharacter[p.character_id]) {
      posesByCharacter[p.character_id] = [];
    }
    posesByCharacter[p.character_id]!.push(p);
  }

  // Map approved variation URLs
  const approvedImages: Record<string, string> = {};
  for (const v of variationsRes.data || []) {
    approvedImages[v.character_id] = v.image_url;
  }

  const characters = (charsRes.data || []).map((char) => ({
    ...char,
    poses: posesByCharacter[char.id] || [],
    approved_image_url: approvedImages[char.id] || null,
  }));

  return NextResponse.json({ characters });
}

// POST /api/projects/:id/lock — generate reference poses for cast characters
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const characterId = body.character_id; // optional: generate for one character
  const supabase = getSupabase();

  // Get characters that have an approved cast
  let query = supabase
    .from("characters")
    .select("*")
    .eq("project_id", id)
    .not("approved_cast_id", "is", null);

  if (characterId) {
    query = query.eq("id", characterId);
  }

  const { data: characters, error: charError } = await query;

  if (charError || !characters || characters.length === 0) {
    return NextResponse.json(
      { error: "No cast characters found. Approve casting first." },
      { status: 400 }
    );
  }

  let totalGenerated = 0;

  for (const char of characters) {
    // Check which poses already exist
    const { data: existingPoses } = await supabase
      .from("character_poses")
      .select("pose_type")
      .eq("character_id", char.id);

    const existingTypes = new Set(
      (existingPoses || []).map((p) => p.pose_type)
    );

    for (const poseType of POSE_TYPES) {
      if (existingTypes.has(poseType)) continue;

      try {
        const result = await generatePoseImage(
          char.name,
          char.description,
          poseType
        );

        await supabase.from("character_poses").insert({
          character_id: char.id,
          project_id: id,
          pose_type: poseType,
          image_url: result.url,
          prompt_used: result.prompt,
        });

        totalGenerated++;
      } catch (err) {
        console.error(
          `Failed to generate ${poseType} pose for ${char.name}:`,
          err
        );
      }
    }

    // Update pose_refs JSON on the character
    const { data: allPoses } = await supabase
      .from("character_poses")
      .select("pose_type, image_url")
      .eq("character_id", char.id);

    const poseRefs: Record<string, string> = {};
    for (const p of allPoses || []) {
      poseRefs[p.pose_type] = p.image_url;
    }

    await supabase
      .from("characters")
      .update({ pose_refs: poseRefs })
      .eq("id", char.id);
  }

  return NextResponse.json({
    success: true,
    generated: totalGenerated,
    characters: characters.length,
  });
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
    // Lock all characters that have all 3 poses
    const { data: chars } = await supabase
      .from("characters")
      .select("id")
      .eq("project_id", id)
      .not("approved_cast_id", "is", null);

    for (const char of chars || []) {
      const { count } = await supabase
        .from("character_poses")
        .select("*", { count: "exact", head: true })
        .eq("character_id", char.id);

      if ((count || 0) >= 3) {
        await supabase
          .from("characters")
          .update({ locked: true })
          .eq("id", char.id);
      }
    }

    // Check if ALL characters are locked
    const { data: unlocked } = await supabase
      .from("characters")
      .select("id")
      .eq("project_id", id)
      .eq("locked", false);

    if (!unlocked || unlocked.length === 0) {
      // Advance phase to 'lock'
      await supabase
        .from("projects")
        .update({ phase_status: "lock" })
        .eq("id", id);
    }

    return NextResponse.json({ success: true });
  }

  if (character_id) {
    // Lock a single character
    const { count } = await supabase
      .from("character_poses")
      .select("*", { count: "exact", head: true })
      .eq("character_id", character_id);

    if ((count || 0) < 3) {
      return NextResponse.json(
        { error: "Character needs all 3 poses before locking" },
        { status: 400 }
      );
    }

    await supabase
      .from("characters")
      .update({ locked: true })
      .eq("id", character_id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
