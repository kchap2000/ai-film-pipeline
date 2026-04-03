import { getSupabase } from "@/lib/supabase";
import { generatePoseSheet } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POSE_SHEET_PROMPT = `Photorealistic character sheet based strictly and only on the provided reference image.
The generated character must exactly match the individual shown in the reference image, including facial structure, bone structure, body proportions, age appearance, skin tone, hair color, hairstyle, hair length, facial hair if present, eye color, and all visible physical traits. Do not beautify, stylize, idealize, or alter the character in any way.
Wardrobe must exactly match what is visible in the reference image, including clothing type, fit, fabric, color, wear, and construction details. Do not add, remove, or reinterpret clothing elements unless explicitly instructed. No additional accessories, jewelry, props, or styling beyond what is present in the reference image.
The character is presented in a neutral, documentary style for identity locking and continuity purposes. Expression is natural and relaxed, not posed or performative. Body language is neutral and unexaggerated.
Lighting is clean, realistic, and neutral, resembling soft natural daylight or balanced studio light depending on the reference. Skin texture must remain realistic with visible pores, natural imperfections, and accurate color. No beauty retouching, no smoothing, no cinematic grading, no stylization.
The character sheet includes multiple angles appropriate for production reference, such as: front-facing view, three-quarter view, side profile, back view (if applicable), head-and-shoulders portrait.
Camera framing is realistic and proportional, as if captured with a real camera. True-to-life scale, accurate perspective, and consistent anatomy across all views. No distortion, no exaggerated lens effects.
This image is intended as a canonical character reference for visual continuity across scenes, shots, and tools. Accuracy and consistency take priority over aesthetics.`;

// POST /api/projects/:id/posesheet
// Body: { character_id: string }
// Generates a multi-angle character reference sheet from the approved headshot.
// Stores result in characters.pose_sheet_url.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const { character_id } = body as { character_id?: string };

    if (!character_id) {
      return NextResponse.json({ error: "character_id is required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Get character + approved cast variation image
    const { data: char, error: charErr } = await supabase
      .from("characters")
      .select("id, name, description, personality, approved_cast_id, pose_sheet_url")
      .eq("id", character_id)
      .eq("project_id", id)
      .single();

    if (charErr || !char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    if (!char.approved_cast_id) {
      return NextResponse.json({ error: "Character has no approved cast — lock a headshot first" }, { status: 400 });
    }

    // Get the approved headshot image
    const { data: variation, error: varErr } = await supabase
      .from("cast_variations")
      .select("image_url")
      .eq("id", char.approved_cast_id)
      .single();

    if (varErr || !variation?.image_url) {
      return NextResponse.json({ error: "Approved cast image not found" }, { status: 404 });
    }

    // Generate the pose sheet using the headshot as reference
    const description = [char.description, char.personality].filter(Boolean).join(" ");
    const result = await generatePoseSheet(
      char.name,
      description,
      variation.image_url,
      POSE_SHEET_PROMPT
    );

    // Store pose sheet URL on the character
    const { error: updateErr } = await supabase
      .from("characters")
      .update({ pose_sheet_url: result.url })
      .eq("id", character_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      character_id,
      pose_sheet_url: result.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pose sheet generation failed";
    console.error("Posesheet POST crash:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/projects/:id/posesheet?character_id=xxx
// Returns the current pose_sheet_url for a character (for polling).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const characterId = req.nextUrl.searchParams.get("character_id");

  if (!characterId) {
    return NextResponse.json({ error: "character_id is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("characters")
    .select("pose_sheet_url")
    .eq("id", characterId)
    .eq("project_id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ pose_sheet_url: data.pose_sheet_url || null });
}
