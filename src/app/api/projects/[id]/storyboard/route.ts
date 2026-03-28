import { getSupabase } from "@/lib/supabase";
import { generateStoryboardPanel } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/:id/storyboard — get all panels grouped by scene
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [scenesRes, panelsRes, charsRes, locsRes] = await Promise.all([
    supabase
      .from("scenes")
      .select("*")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("storyboard_panels")
      .select("*")
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("characters")
      .select("id, name, description, approved_variation_url")
      .eq("project_id", id),
    supabase
      .from("locations")
      .select("id, name, description, time_of_day, mood, approved_image_url")
      .eq("project_id", id),
  ]);

  // Group panels by scene
  const panelsByScene: Record<string, typeof panelsRes.data> = {};
  for (const p of panelsRes.data || []) {
    if (!panelsByScene[p.scene_id]) {
      panelsByScene[p.scene_id] = [];
    }
    panelsByScene[p.scene_id]!.push(p);
  }

  const scenes = (scenesRes.data || []).map((scene) => ({
    ...scene,
    panels: panelsByScene[scene.id] || [],
  }));

  return NextResponse.json({
    scenes,
    characters: charsRes.data || [],
    locations: locsRes.data || [],
    totalPanels: (panelsRes.data || []).length,
  });
}

// POST /api/projects/:id/storyboard — generate storyboard panels for scenes
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const targetSceneId = body.scene_id as string | undefined;
  const supabase = getSupabase();

  // Fetch scenes, characters, locations
  let scenesQuery = supabase
    .from("scenes")
    .select("*")
    .eq("project_id", id)
    .order("scene_number", { ascending: true });
  if (targetSceneId) {
    scenesQuery = scenesQuery.eq("id", targetSceneId);
  }

  const [scenesRes, charsRes, locsRes] = await Promise.all([
    scenesQuery,
    supabase
      .from("characters")
      .select("name, description")
      .eq("project_id", id),
    supabase
      .from("locations")
      .select("name, description, time_of_day, mood")
      .eq("project_id", id),
  ]);

  const scenes = scenesRes.data || [];
  const charDescMap: Record<string, string> = {};
  for (const c of charsRes.data || []) {
    charDescMap[c.name] = c.description || "";
  }
  const locMap: Record<string, { description: string; time_of_day: string; mood: string }> = {};
  for (const l of locsRes.data || []) {
    locMap[l.name.toLowerCase().trim()] = {
      description: l.description || "",
      time_of_day: l.time_of_day || "",
      mood: l.mood || "",
    };
  }

  // Break each scene into shots using Claude
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic();

  let totalPanels = 0;

  for (const scene of scenes) {
    // Check if panels already exist
    const { count } = await supabase
      .from("storyboard_panels")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", scene.id);

    if ((count || 0) > 0) continue;

    // Use Claude to break the scene into shots
    const shotBreakdown = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 2000,
      system: `You are a film storyboard artist breaking a scene into individual shots.
For each shot, provide: shot_type (wide/medium/close-up/extreme-close-up/OTS/POV/two-shot/insert), camera_angle (eye-level/low/high/dutch/bird's-eye/worm's-eye), camera_movement (static/pan-left/pan-right/tilt-up/tilt-down/dolly-in/dolly-out/crane-up/crane-down/handheld/steadicam), action_description (what happens in this shot), dialogue (any dialogue in this shot, empty string if none), characters_in_shot (array of character names visible), duration_seconds (estimated duration 1.0-10.0).
Return ONLY valid JSON: { "shots": [...] }. Aim for 3-8 shots per scene depending on complexity.`,
      messages: [
        {
          role: "user",
          content: `Break this scene into individual storyboard shots:

Scene ${scene.scene_number}: ${scene.location || "Unknown Location"}
Time: ${scene.time_of_day || "Day"}
Mood: ${scene.mood || "Neutral"}
Action: ${scene.action_summary || "No action described"}
Characters present: ${(scene.characters_present || []).join(", ") || "None specified"}
Props: ${(scene.props || []).join(", ") || "None"}
Wardrobe: ${(scene.wardrobe || []).join(", ") || "None"}`,
        },
      ],
    });

    let shots: Array<{
      shot_type: string;
      camera_angle: string;
      camera_movement: string;
      action_description: string;
      dialogue: string;
      characters_in_shot: string[];
      duration_seconds: number;
    }> = [];

    try {
      const text = shotBreakdown.content
        .filter((b) => b.type === "text")
        .map((b) => {
          if (b.type === "text") return b.text;
          return "";
        })
        .join("");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        shots = parsed.shots || [];
      }
    } catch {
      // Fallback: single wide shot
      shots = [
        {
          shot_type: "wide",
          camera_angle: "eye-level",
          camera_movement: "static",
          action_description: scene.action_summary || "Scene action",
          dialogue: "",
          characters_in_shot: scene.characters_present || [],
          duration_seconds: 5.0,
        },
      ];
    }

    // Generate panel images and save
    const locKey = (scene.location || "").toLowerCase().trim();
    const locInfo = locMap[locKey] || {
      description: scene.location || "",
      time_of_day: scene.time_of_day || "",
      mood: scene.mood || "",
    };

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const panelNumber = i + 1;

      try {
        const result = await generateStoryboardPanel({
          actionDescription: shot.action_description,
          shotType: shot.shot_type,
          cameraAngle: shot.camera_angle,
          cameraMovement: shot.camera_movement,
          charactersInShot: shot.characters_in_shot,
          characterDescriptions: charDescMap,
          locationName: scene.location || "Unknown",
          locationDescription: locInfo.description,
          timeOfDay: locInfo.time_of_day,
          mood: locInfo.mood,
          panelNumber,
        });

        await supabase.from("storyboard_panels").insert({
          project_id: id,
          scene_id: scene.id,
          panel_number: panelNumber,
          shot_type: shot.shot_type,
          camera_angle: shot.camera_angle,
          camera_movement: shot.camera_movement,
          action_description: shot.action_description,
          dialogue: shot.dialogue || "",
          characters_in_shot: shot.characters_in_shot || [],
          image_url: result.url,
          prompt_used: result.prompt,
          duration_seconds: shot.duration_seconds || 3.0,
        });

        totalPanels++;
      } catch (err) {
        console.error(`Failed to generate panel ${panelNumber} for scene ${scene.scene_number}:`, err);
      }
    }
  }

  // Advance project phase
  await supabase
    .from("projects")
    .update({ phase_status: "storyboard" })
    .eq("id", id);

  return NextResponse.json({
    success: true,
    panelsGenerated: totalPanels,
    scenesProcessed: scenes.length,
  });
}
