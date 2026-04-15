import { createRouteClient } from "@/lib/supabase-route";
import {
  generatePoseSheet,
  generateWithGemini,
  ReferenceImageUnreachableError,
} from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POSE_SHEET_PROMPT = `Create a 9-image storyboard (NOT a single collage).
Each image is a separate cinematic frame.
Use the provided reference image as the exact identity anchor for the character.
The character must remain 100% consistent across all images:
same face
same hairstyle
same proportions
same textures and details
Photorealistic, cinematic quality.

REFERENCE IMAGE
Use the uploaded/reference image as the primary identity source.
Do not reinterpret or redesign the character. Maintain exact likeness.

Scene 1: Full Body – Front Neutral
Straight-on full-body shot. Character standing upright, facing camera directly. Arms relaxed. Neutral expression. Clean, centered composition.

Scene 2: Full Body – Left Profile
Full-body side profile facing left. Natural posture. Emphasis on silhouette and clothing shape.

Scene 3: Full Body – Back View
Character facing away from camera. Full-body shot highlighting back of outfit, textures, and structure.

Scene 4: Mid Shot – Emotional Variation
Waist-up shot, slight angle (3/4 view). Expression shows personality (confident, haunted, calm, intense, etc.).

Scene 5: Close-Up – Face (Neutral)
Tight frontal close-up. Neutral expression. Focus on facial structure and skin detail.

Scene 6: Close-Up – Feature Detail
Extreme close-up of defining feature (eyes, mouth, scar, jewelry, texture, etc.). Sharp detail, shallow depth of field.

Scene 7: Head Profile Close-Up
Tight side profile of head and neck. Clean silhouette. Emphasis on bone structure and skin texture.

Scene 8: Full Body – Low Angle
Low-angle full-body shot looking up at character. Cinematic presence, slightly more dramatic framing.

Scene 9: Close-Up – Expression Variation
Tight close-up of face with a different emotional expression (eyes closed, distant stare, subtle tension, etc.).

🎯 STYLE + CONSISTENCY BLOCK (KEEP EXACTLY AS IS)
Lighting inspired by dramatic studio cinema portraiture: soft key light with subtle rim light, shallow depth of field, photorealistic skin detail, cinematic contrast.
Background: simple neutral light gray studio cyclorama.
CRITICAL OUTFIT RULE: The character must wear EXACTLY the same clothing as shown in the reference/headshot image provided. Do NOT invent or substitute any clothing. Copy the outfit precisely — same shirt, same jacket, same color, same style. If the reference shows a specific outfit, reproduce it faithfully in all 9 frames.
IMPORTANT: Same person, same face, same hairstyle, same exact outfit from reference image in every image.
Lens style: anamorphic cinematic feel, shallow DOF, realistic proportions.`;

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

    const { supabase, user } = await createRouteClient();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const fullPrompt = [
      POSE_SHEET_PROMPT,
      `Character name: ${char.name}.`,
      description ? `Physical description for reference: ${description}.` : "",
    ].filter(Boolean).join("\n");

    let result;
    try {
      result = await generatePoseSheet(
        char.name,
        description,
        variation.image_url,
        POSE_SHEET_PROMPT
      );
    } catch (err) {
      // Distinguish "reference unreachable" (a real failure we must surface)
      // from Gemini errors (fall through to placeholder + text-only retry).
      if (err instanceof ReferenceImageUnreachableError) {
        console.error(`Pose sheet for ${char.name}: reference headshot unreachable`, err.message);
        return NextResponse.json(
          {
            error:
              "Could not load this character's approved headshot for multimodal reference. Check that the Supabase Storage bucket is public and the URL resolves.",
            reference_url: variation.image_url,
          },
          { status: 502 }
        );
      }
      throw err;
    }

    let isPlaceholder = result.url.startsWith("data:image/svg+xml");

    // If multimodal was blocked (content policy), retry text-only
    if (isPlaceholder) {
      console.log(`Pose sheet for ${char.name}: multimodal blocked, retrying text-only`);
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (apiKey && apiKey !== "your-key-here") {
        try {
          const textOnlyResult = await generateWithGemini(apiKey, fullPrompt, char.name, 99);
          if (!textOnlyResult.url.startsWith("data:image/svg+xml")) {
            result = textOnlyResult;
            isPlaceholder = false;
          }
        } catch {
          // Text-only also failed — keep the SVG placeholder
          console.log(`Pose sheet for ${char.name}: text-only also failed, keeping placeholder`);
        }
      }
    }

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
      is_placeholder: isPlaceholder,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pose sheet generation failed";
    console.error("Posesheet POST crash:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/projects/:id/posesheet
// Body JSON: { character_id: string, storage_path: string, image_url: string }
// Registers a user-uploaded reference sheet (browser uploads directly to Storage,
// then calls this endpoint with the public URL — same pattern as cast PUT).
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = (await req.json()) as {
      character_id?: string;
      storage_path?: string;
      image_url?: string;
    };
    const { character_id: characterId, storage_path: storagePath, image_url: imageUrl } = body;

    if (!characterId || !storagePath || !imageUrl) {
      return NextResponse.json(
        { error: "character_id, storage_path, and image_url are required" },
        { status: 400 }
      );
    }

    const { supabase, user } = await createRouteClient();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify character belongs to project
    const { data: char, error: charErr } = await supabase
      .from("characters")
      .select("id")
      .eq("id", characterId)
      .eq("project_id", id)
      .single();

    if (charErr || !char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const { error: updateErr } = await supabase
      .from("characters")
      .update({ pose_sheet_url: imageUrl })
      .eq("id", characterId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      character_id: characterId,
      pose_sheet_url: imageUrl,
      is_placeholder: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pose sheet upload failed";
    console.error("Posesheet PUT crash:", message);
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

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("characters")
    .select("pose_sheet_url")
    .eq("id", characterId)
    .eq("project_id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ pose_sheet_url: data.pose_sheet_url || null });
}
