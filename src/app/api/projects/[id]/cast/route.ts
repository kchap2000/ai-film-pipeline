import { getSupabase } from "@/lib/supabase";
import { generateCastingImage } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

// Vercel-compatible: each call generates exactly ONE image, fitting within 60s limit.
// The UI loops from variation 1→10, calling POST once per image with progress updates.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s — safe for one image on Hobby plan

const VARIATIONS_PER_CHARACTER = 10;

// GET /api/projects/:id/cast — get all characters with their casting variations
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [charsRes, variationsRes] = await Promise.all([
    supabase
      .from("characters")
      .select("*")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("cast_variations")
      .select("*")
      .eq("project_id", id)
      .order("variation_number", { ascending: true }),
  ]);

  // Group variations by character_id
  const variationsByCharacter: Record<string, typeof variationsRes.data> = {};
  for (const v of variationsRes.data || []) {
    if (!variationsByCharacter[v.character_id]) {
      variationsByCharacter[v.character_id] = [];
    }
    variationsByCharacter[v.character_id]!.push(v);
  }

  const characters = (charsRes.data || []).map((char) => ({
    ...char,
    variations: variationsByCharacter[char.id] || [],
  }));

  return NextResponse.json({ characters });
}

// POST /api/projects/:id/cast — generate ONE casting variation
// Body: { character_id: string, variation_number: number }
// Call this 10 times (once per variation) from the UI — each call completes in <60s.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Top-level catch — always return JSON, never Vercel's HTML error page
  try {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { character_id, variation_number } = body as {
    character_id?: string;
    variation_number?: number;
  };

  if (!character_id) {
    return NextResponse.json(
      { error: "character_id is required" },
      { status: 400 }
    );
  }

  const variationNum = variation_number ?? 1;
  if (variationNum < 1 || variationNum > VARIATIONS_PER_CHARACTER) {
    return NextResponse.json(
      { error: `variation_number must be 1–${VARIATIONS_PER_CHARACTER}` },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Look up the character
  const { data: char, error: charError } = await supabase
    .from("characters")
    .select("*")
    .eq("id", character_id)
    .eq("project_id", id)
    .single();

  if (charError || !char) {
    return NextResponse.json(
      { error: "Character not found" },
      { status: 404 }
    );
  }

  // Skip if this variation already exists
  const { count } = await supabase
    .from("cast_variations")
    .select("*", { count: "exact", head: true })
    .eq("character_id", character_id)
    .eq("variation_number", variationNum);

  if (count && count > 0) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: `Variation ${variationNum} already exists`,
    });
  }

  // Generate the image
  let result;
  try {
    result = await generateCastingImage(char.name, char.description, variationNum);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Image generation failed: ${msg}` },
      { status: 500 }
    );
  }

  // Save to DB
  const { data: variation, error: insertError } = await supabase
    .from("cast_variations")
    .insert({
      character_id,
      project_id: id,
      image_url: result.url,
      prompt_used: result.prompt,
      variation_number: variationNum,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `DB insert failed: ${insertError.message}` },
      { status: 500 }
    );
  }

  // Advance phase to casting if not already there
  await supabase
    .from("projects")
    .update({ phase_status: "casting" })
    .eq("id", id)
    .in("phase_status", ["ingestion", "extraction", "bible"]);

  return NextResponse.json({
    success: true,
    variation,
  });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error during image generation";
    console.error("Cast route crash:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/projects/:id/cast — update variation status (approve/reject)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { variation_id, status, rejection_note, character_id } = body;

  const supabase = getSupabase();

  if (variation_id && status) {
    // Update a single variation's status
    const update: Record<string, string | null> = { status };
    if (status === "rejected" && rejection_note) {
      update.rejection_note = rejection_note;
    }

    const { error } = await supabase
      .from("cast_variations")
      .update(update)
      .eq("id", variation_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If approving, set as the character's approved cast and reject others
    if (status === "approved" && character_id) {
      await supabase
        .from("cast_variations")
        .update({ status: "rejected" })
        .eq("character_id", character_id)
        .neq("id", variation_id)
        .eq("status", "pending");

      await supabase
        .from("characters")
        .update({ approved_cast_id: variation_id })
        .eq("id", character_id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
