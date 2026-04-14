import { createRouteClient } from "@/lib/supabase-route";
import { generateSceneScoutImage } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VARIATIONS_PER_SCENE = 3;

// GET /api/projects/:id/scenes — return scenes with their scout variations
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [scenesRes, varsRes] = await Promise.all([
    supabase
      .from("scenes")
      .select("id, project_id, scene_number, location, time_of_day, mood, action_summary, characters_present, props, wardrobe, locked, scene_type")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("scene_variations")
      .select("id, scene_id, variation_number, status, prompt_used, created_at")
      .eq("project_id", id)
      .order("variation_number", { ascending: true }),
  ]);

  const varsByScene: Record<string, typeof varsRes.data> = {};
  for (const v of varsRes.data || []) {
    if (!varsByScene[v.scene_id]) varsByScene[v.scene_id] = [];
    varsByScene[v.scene_id]!.push(v);
  }

  const scenes = (scenesRes.data || []).map((scene) => ({
    ...scene,
    variations: varsByScene[scene.id] || [],
  }));

  return NextResponse.json({ scenes });
}

// POST /api/projects/:id/scenes — generate scout images for all scenes (or one)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const sceneId = body.scene_id as string | undefined;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch scenes to generate
  let sceneQuery = supabase
    .from("scenes")
    .select("*")
    .eq("project_id", id)
    .order("scene_number", { ascending: true });
  if (sceneId) sceneQuery = sceneQuery.eq("id", sceneId);
  const { data: scenes, error: sceneErr } = await sceneQuery;

  if (sceneErr || !scenes || scenes.length === 0) {
    return NextResponse.json(
      { error: "No scenes found. Run extraction first." },
      { status: 400 }
    );
  }

  // Fetch per-project production directive once so every variation honors it
  const { data: projectRow } = await supabase
    .from("projects")
    .select("production_notes")
    .eq("id", id)
    .single();
  const productionNotes: string = projectRow?.production_notes || "";

  // Fetch all characters so we can include descriptions in prompts
  const { data: characters } = await supabase
    .from("characters")
    .select("name, description")
    .eq("project_id", id);

  const charDescriptions: Record<string, string> = {};
  for (const c of characters || []) {
    charDescriptions[c.name] = c.description || "";
  }

  let totalGenerated = 0;
  const errors: string[] = [];

  for (const scene of scenes) {
    // Count existing variations for this scene
    const { count } = await supabase
      .from("scene_variations")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", scene.id);

    const existing = count || 0;
    const needed = VARIATIONS_PER_SCENE - existing;
    if (needed <= 0) continue;

    for (let i = existing + 1; i <= VARIATIONS_PER_SCENE; i++) {
      try {
        const result = await generateSceneScoutImage({
          sceneNumber: scene.scene_number,
          actionSummary: scene.action_summary || "",
          location: scene.location || "",
          timeOfDay: scene.time_of_day || "",
          mood: scene.mood || "",
          sceneType: scene.scene_type || "real",
          charactersPresent: scene.characters_present || [],
          characterDescriptions: charDescriptions,
          variationNumber: i,
          productionNotes,
        });

        await supabase.from("scene_variations").insert({
          scene_id: scene.id,
          project_id: id,
          image_url: result.url,
          prompt_used: result.prompt,
          variation_number: i,
          status: "pending",
        });

        totalGenerated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Scene ${scene.scene_number} variation ${i} failed:`, msg);
        errors.push(`Scene ${scene.scene_number} #${i}: ${msg}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    generated: totalGenerated,
    scenes: scenes.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// PATCH /api/projects/:id/scenes — approve/reject variation, or lock a scene
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Approve / reject a variation
  if (body.variation_id && body.status) {
    await supabase
      .from("scene_variations")
      .update({ status: body.status, rejection_note: body.rejection_note || null })
      .eq("id", body.variation_id);

    if (body.status === "approved" && body.scene_id) {
      // Get the approved variation's image URL
      const { data: variation } = await supabase
        .from("scene_variations")
        .select("image_url")
        .eq("id", body.variation_id)
        .single();

      // Reject all other pending variations for this scene
      await supabase
        .from("scene_variations")
        .update({ status: "rejected" })
        .eq("scene_id", body.scene_id)
        .neq("id", body.variation_id)
        .eq("status", "pending");

      // Store approved scout image on the scene
      await supabase
        .from("scenes")
        .update({ approved_scout_image_url: variation?.image_url || null })
        .eq("id", body.scene_id);
    }

    return NextResponse.json({ success: true });
  }

  // Lock all scenes that have an approved scout image
  if (body.lock_all) {
    await supabase
      .from("scenes")
      .update({ locked: true })
      .eq("project_id", id)
      .not("approved_scout_image_url", "is", null);

    // Advance phase to storyboard
    await supabase
      .from("projects")
      .update({ phase_status: "storyboard" })
      .eq("id", id)
      .in("phase_status", ["scene_bible", "lock", "casting"]);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
