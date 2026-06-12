import { createRouteClient } from "@/lib/supabase-route";
import { generateStoryboardPanel } from "@/lib/generate-image";
import { getWorldDirectives } from "@/lib/lessons";
import { bumpVersion, recordProvenance, type ProvenanceSource } from "@/lib/provenance";
import { getProjectBrainPrompt } from "@/lib/project-brain";
import { normalizeProjectAspectRatio } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/projects/:id/storyboard — get all panels grouped by scene
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [scenesRes, panelsRes, charsRes, locsRes, castsRes, projectRes] = await Promise.all([
    supabase
      .from("scenes")
      .select("id, scene_number, location, time_of_day, mood, action_summary, characters_present, props, wardrobe, locked")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, dialogue, characters_in_shot, duration_seconds, prompt_used, aspect_ratio")
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("characters")
      .select("id, name, description, voice_only")
      .eq("project_id", id),
    supabase
      .from("locations")
      .select("id, name, description, time_of_day, mood")
      .eq("project_id", id),
    supabase
      .from("cast_variations")
      .select("id, character_id, variation_number, status")
      .eq("project_id", id)
      .eq("status", "approved"),
    supabase
      .from("projects")
      .select("aspect_ratio")
      .eq("id", id)
      .single(),
  ]);

  // Map approved variation IDs to characters (images lazy-loaded by UI)
  const approvedVarByCharId: Record<string, string> = {};
  for (const cv of castsRes.data || []) {
    approvedVarByCharId[cv.character_id] = cv.id;
  }

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

  const characters = (charsRes.data || []).map((c) => ({
    ...c,
    approved_variation_id: approvedVarByCharId[c.id] || null,
  }));

  return NextResponse.json({
    scenes,
    characters,
    locations: locsRes.data || [],
    totalPanels: (panelsRes.data || []).length,
    project: {
      aspect_ratio: normalizeProjectAspectRatio(projectRes.data?.aspect_ratio),
    },
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
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch scenes, characters, locations
  let scenesQuery = supabase
    .from("scenes")
    .select("*")
    .eq("project_id", id)
    .order("scene_number", { ascending: true });
  if (targetSceneId) {
    scenesQuery = scenesQuery.eq("id", targetSceneId);
  }

  const [scenesRes, charsRes, locsRes, projectRes] = await Promise.all([
    scenesQuery,
    // NOTE: we now also need approved_cast_id + voice_only so we can look up
    // per-character approved headshot URLs for multimodal identity refs.
    supabase
      .from("characters")
      .select("id, name, description, approved_cast_id, voice_only")
      .eq("project_id", id),
    supabase
      .from("locations")
      .select("id, name, description, time_of_day, mood")
      .eq("project_id", id),
    supabase
      .from("projects")
      .select("production_notes, aspect_ratio, script_text")
      .eq("id", id)
      .single(),
  ]);
  // World rules + lessons (learning system) constrain both the shot
  // breakdown text AND the panel art prompts
  const worldDirectives = await getWorldDirectives(supabase, id);
  const productionNotes: string = [projectRes.data?.production_notes || "", worldDirectives]
    .filter(Boolean)
    .join("\n\n");
  const aspectRatio = normalizeProjectAspectRatio(projectRes.data?.aspect_ratio);
  // The actual script — the shot breakdown quotes dialogue VERBATIM from
  // here. Truncated for prompt budget; scene summaries still cover the rest.
  const scriptText: string = (projectRes.data?.script_text || "").slice(0, 30_000);

  const scenes = scenesRes.data || [];
  const charDescMap: Record<string, string> = {};
  const charIdByName: Record<string, string> = {};
  for (const c of charsRes.data || []) {
    charDescMap[c.name] = c.description || "";
    charIdByName[c.name] = c.id;
  }

  // Build name → approved headshot URL lookup. Voice-only characters are
  // excluded (they have no on-screen identity to anchor). Used to pass
  // `characterReferences` into generateStoryboardPanel so panel art locks
  // to cast the same way first-frame gen does.
  const approvedCastIds = (charsRes.data || [])
    .filter((c) => c.approved_cast_id && !c.voice_only)
    .map((c) => c.approved_cast_id as string);
  const headshotUrlByName: Record<string, string> = {};
  if (approvedCastIds.length > 0) {
    const { data: variations } = await supabase
      .from("cast_variations")
      .select("id, image_url")
      .in("id", approvedCastIds);
    const urlByCastId: Record<string, string> = {};
    for (const v of variations || []) urlByCastId[v.id] = v.image_url;
    for (const c of charsRes.data || []) {
      if (c.approved_cast_id && !c.voice_only && urlByCastId[c.approved_cast_id]) {
        headshotUrlByName[c.name] = urlByCastId[c.approved_cast_id];
      }
    }
  }
  const locMap: Record<string, { id: string; description: string; time_of_day: string; mood: string }> = {};
  for (const l of locsRes.data || []) {
    locMap[l.name.toLowerCase().trim()] = {
      id: l.id,
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
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: `You are a film storyboard artist breaking a scene into individual shots for a premium vertical-drama episode (DramaBox-style pacing).
For each shot, provide: shot_type (wide/medium/close-up/extreme-close-up/OTS/POV/two-shot/insert), camera_angle (eye-level/low/high/dutch/bird's-eye/worm's-eye), camera_movement (static/pan-left/pan-right/tilt-up/tilt-down/dolly-in/dolly-out/crane-up/crane-down/handheld/steadicam), action_description (what happens in this shot — ONE clear action beat, not several), dialogue (the dialogue spoken during this shot, empty string if none), characters_in_shot (array of character names visible), duration_seconds (2.0-6.0; up to 9.0 only for a major set-piece beat).

SHOT DENSITY — match TV-drama pacing:
- Action/set-piece scenes: 14-24 shots. Dialogue scenes: 8-14 shots.
- EVERY scripted dialogue line gets its own shot of its speaker (or a reaction shot carrying the line as off-screen audio).
- Key reactions get their own shots. Big action beats split into multiple shots (approach / impact / aftermath).
- Alternate framings: wide for geography, medium for action, close-up for emotion, extreme-close-up as punctuation (an eye, a weapon, a hand).

DIALOGUE FIDELITY — non-negotiable:
- When the script text is provided, use its dialogue VERBATIM. Never invent, paraphrase, trim, or merge lines.
- Format each line with speaker attribution and tone: NAME (tone): "exact line". Keep (V.O.) / (cont'd) markers.
- Chants, crowd lines, and repeated shouts are dialogue too — keep their build (whisper to roar) across shots.

FULL COVERAGE — non-negotiable:
- The shot list must cover the ENTIRE scene, from its first scripted moment to its last. Do not stop partway.
- Before finishing, verify your LAST shot depicts the scene's final scripted beat. If the scene ends in celebration, the last shot is the celebration — not the midpoint.
- Keep action_description tight (1-2 sentences) so the full scene fits.

Return ONLY valid JSON: { "shots": [...] }.`,
      messages: [
        {
          role: "user",
          content: `${worldDirectives ? `${worldDirectives}\n\n` : ""}Break this scene into individual storyboard shots:

Scene ${scene.scene_number}: ${scene.location || "Unknown Location"}
Time: ${scene.time_of_day || "Day"}
Mood: ${scene.mood || "Neutral"}
Action: ${scene.action_summary || "No action described"}
Characters present: ${(scene.characters_present || []).join(", ") || "None specified"}
Props: ${(scene.props || []).join(", ") || "None"}
Wardrobe: ${(scene.wardrobe || []).join(", ") || "None"}${
            scriptText
              ? `

--- FULL SCRIPT (quote dialogue verbatim from here; use only the parts belonging to this scene) ---

${scriptText}`
              : ""
          }`,
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

    const locKey = (scene.location || "").toLowerCase().trim();
    const locInfo = locMap[locKey] || {
      id: scene.location_id || "",
      description: scene.location || "",
      time_of_day: scene.time_of_day || "",
      mood: scene.mood || "",
    };

    // ── Phase 1: insert ALL panel rows first ──────────────────
    // Coverage is sacred: a 24-shot breakdown must land 24 rows. Panel ART
    // rendering takes ~20s/panel via Gemini, which blows the 300s function
    // limit around panel 14 and silently truncates the scene — so art is a
    // second pass with a hard time budget, and unrendered panels keep an
    // empty image_url (first_frames generates the real frames regardless).
    const insertedPanels: Array<{ rowId: string; shot: (typeof shots)[number]; panelNumber: number }> = [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const panelNumber = i + 1;
      const { data: inserted } = await supabase
        .from("storyboard_panels")
        .insert({
          project_id: id,
          scene_id: scene.id,
          panel_number: panelNumber,
          shot_type: shot.shot_type,
          camera_angle: shot.camera_angle,
          camera_movement: shot.camera_movement,
          action_description: shot.action_description,
          dialogue: shot.dialogue || "",
          characters_in_shot: shot.characters_in_shot || [],
          image_url: "",
          prompt_used: "",
          aspect_ratio: aspectRatio,
          duration_seconds: shot.duration_seconds || 3.0,
        })
        .select("id")
        .single();
      if (!inserted) continue;
      insertedPanels.push({ rowId: inserted.id, shot, panelNumber });
      totalPanels++;

      const sources: ProvenanceSource[] = [
        { sourceType: "scene", sourceId: scene.id, relationship: "shot_breakdown" },
        { sourceType: "project", sourceId: id, relationship: "production_notes" },
      ];
      if (locInfo.id) {
        sources.push({ sourceType: "location", sourceId: locInfo.id, relationship: "location_context" });
      }
      for (const name of shot.characters_in_shot || []) {
        const charId = charIdByName[name];
        if (charId) {
          sources.push({ sourceType: "character", sourceId: charId, relationship: "character_identity" });
        }
      }
      await recordProvenance(supabase, {
        projectId: id,
        assetType: "storyboard_panel",
        assetId: inserted.id,
        sources,
        metadata: { scene_number: scene.scene_number, panel_number: panelNumber, aspect_ratio: aspectRatio },
      });
    }

    // ── Phase 2: render panel art within the time budget ──────
    const ART_DEADLINE_MS = 220_000; // leave headroom inside maxDuration
    const artStart = Date.now();
    for (const { rowId, shot, panelNumber } of insertedPanels) {
      if (Date.now() - artStart > ART_DEADLINE_MS) break; // rest stay preview-less
      const characterReferences = (shot.characters_in_shot || [])
        .map((name: string) => {
          const imageUrl = headshotUrlByName[name];
          return imageUrl ? { name, imageUrl } : null;
        })
        .filter((x): x is { name: string; imageUrl: string } => x !== null);
      const brainPrompt = await getProjectBrainPrompt(supabase, id, {
        targetType: "scene",
        targetId: scene.id,
        characterNames: shot.characters_in_shot || [],
      });
      const notesWithBrain = [productionNotes, brainPrompt].filter(Boolean).join("\n\n");

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
          sceneReferenceImageUrl: scene.approved_scout_image_url || null,
          productionNotes: notesWithBrain,
          aspectRatio,
          characterReferences,
        });
        await supabase
          .from("storyboard_panels")
          .update({ image_url: result.url, prompt_used: result.prompt })
          .eq("id", rowId);
      } catch (err) {
        console.error(`Failed to render panel art ${panelNumber} for scene ${scene.scene_number}:`, err);
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

// PATCH /api/projects/:id/storyboard
// Body: { panel_id: string, action_description?: string, shot_type?: string,
//         camera_angle?: string, camera_movement?: string }
// Updates a storyboard panel's metadata. Used by the First Frames "Edit
// Prompt" action — editing the panel is the source-of-truth change, so
// subsequent regenerations in either Storyboard or First Frames inherit
// the new description.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { panel_id } = body as { panel_id?: string };
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!panel_id) {
    return NextResponse.json({ error: "panel_id required" }, { status: 400 });
  }

  const allowed = ["action_description", "shot_type", "camera_angle", "camera_movement", "dialogue"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("storyboard_panels")
    .update(update)
    .eq("id", panel_id)
    .eq("project_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await bumpVersion(supabase, "storyboard_panels", panel_id, id);
  return NextResponse.json({ success: true, panel: data });
}
