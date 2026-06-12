import { createRouteClient } from "@/lib/supabase-route";
import { generateCastingImage } from "@/lib/generate-image";
import { getWorldDirectives } from "@/lib/lessons";
import { bumpVersion, recordProvenance } from "@/lib/provenance";
import { getProjectBrainPrompt } from "@/lib/project-brain";
import { evaluateProjectAutomation, recordProjectDecision } from "@/lib/workflow";
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
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [charsRes, variationsRes] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, description, role, personality, approved_cast_id, locked, voice_only")
      .eq("project_id", id)
      .order("role", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("cast_variations")
      .select("id, character_id, variation_number, status, prompt_used, created_at")
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

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Skip if this variation already exists — rejected variations
  // (reference-gate failures) don't count, so gated re-casts regenerate
  const { count } = await supabase
    .from("cast_variations")
    .select("*", { count: "exact", head: true })
    .eq("character_id", character_id)
    .eq("variation_number", variationNum)
    .neq("status", "rejected");

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
    const brainPrompt = await getProjectBrainPrompt(supabase, id, {
      targetType: "character",
      targetId: char.id,
      characterNames: [char.name],
    });
    // World rules ride into CASTING — this is exactly where a medieval
    // soldier got modern tactical gear: nothing told the headshot
    // generator what era it was casting for.
    const worldDirectives = await getWorldDirectives(supabase, id);
    const descriptionWithBrain = [char.description, brainPrompt, worldDirectives].filter(Boolean).join("\n\n");
    result = await generateCastingImage(char.name, descriptionWithBrain, variationNum);
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

  await recordProvenance(supabase, {
    projectId: id,
    assetType: "cast_variation",
    assetId: variation.id,
    sources: [{ sourceType: "character", sourceId: character_id, relationship: "casting_prompt" }],
    metadata: { variation_number: variationNum },
  });

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
  try {
  const body = await req.json();
  const { variation_id, status, rejection_note, character_id } = body;

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

      await bumpVersion(supabase, "characters", character_id, params.id);
      await recordProjectDecision(supabase, {
        projectId: params.id,
        decisionType: "casting",
        subjectType: "character",
        subjectId: character_id,
        status: "approved",
        metadata: { variation_id },
        user,
      });
      await evaluateProjectAutomation(supabase, params.id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("Cast PATCH crash:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/projects/:id/cast — register an uploaded headshot for a character.
// The browser uploads the file directly to Supabase Storage (bypassing Vercel's
// 4.5 MB payload limit), then calls this route with just the storage metadata.
// Body JSON: { character_id: string, storage_path: string, image_url: string }
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json() as { character_id?: string; storage_path?: string; image_url?: string };
    const { character_id: characterId, storage_path: storagePath, image_url: imageUrl } = body;

    if (!characterId || !storagePath || !imageUrl) {
      return NextResponse.json(
        { error: "character_id, storage_path, and image_url are required" },
        { status: 400 }
      );
    }

    const { supabase, user } = await createRouteClient();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify character belongs to this project
    const { data: char, error: charError } = await supabase
      .from("characters")
      .select("id")
      .eq("id", characterId)
      .eq("project_id", id)
      .single();

    if (charError || !char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Determine next variation number
    const { count } = await supabase
      .from("cast_variations")
      .select("*", { count: "exact", head: true })
      .eq("character_id", characterId);

    const variationNumber = (count || 0) + 1;

    // Insert as an auto-approved variation (uploaded headshots are always approved)
    const { data: variation, error: insertError } = await supabase
      .from("cast_variations")
      .insert({
        character_id: characterId,
        project_id: id,
        image_url: imageUrl,
        prompt_used: "uploaded-headshot",
        variation_number: variationNumber,
        status: "approved",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `DB insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    await recordProvenance(supabase, {
      projectId: id,
      assetType: "cast_variation",
      assetId: variation.id,
      sources: [{ sourceType: "character", sourceId: characterId, relationship: "uploaded_headshot" }],
      metadata: { storage_path: storagePath, variation_number: variationNumber },
    });

    // Reject any other pending variations for this character
    await supabase
      .from("cast_variations")
      .update({ status: "rejected" })
      .eq("character_id", characterId)
      .neq("id", variation.id)
      .eq("status", "pending");

    // Set this as the character's approved cast
    await supabase
      .from("characters")
      .update({ approved_cast_id: variation.id })
      .eq("id", characterId);

    await bumpVersion(supabase, "characters", characterId, id);
    await recordProjectDecision(supabase, {
      projectId: id,
      decisionType: "casting",
      subjectType: "character",
      subjectId: characterId,
      status: "approved",
      metadata: { variation_id: variation.id, source: "uploaded_headshot" },
      user,
    });

    // Advance phase to casting if needed
    await supabase
      .from("projects")
      .update({ phase_status: "casting" })
      .eq("id", id)
      .in("phase_status", ["ingestion", "extraction", "bible"]);
    await evaluateProjectAutomation(supabase, id);

    return NextResponse.json({ success: true, variation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Headshot upload failed";
    console.error("Cast PUT crash:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
