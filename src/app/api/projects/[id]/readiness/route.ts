import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/readiness
// Returns the computed pipeline-readiness flags used to gate Phase 9
// (First Frames). UI renders "Generate First Frames (N/M ready)" based on
// the boolean + counts returned here.
//
// Shape:
// {
//   ready_for_first_frames: boolean,
//   checks: {
//     characters_locked: { done: number; total: number; ok: boolean };
//     locations_approved: { done: number; total: number; ok: boolean };
//     scenes_scouted: { done: number; total: number; ok: boolean };
//     scenes_have_panels: { done: number; total: number; ok: boolean };
//   }
// }
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [charsRes, locationsRes, scenesRes, panelsRes] = await Promise.all([
    supabase
      .from("characters")
      .select("id, locked, approved_cast_id, voice_only")
      .eq("project_id", id),
    supabase
      .from("locations")
      .select("id, approved_image_url")
      .eq("project_id", id),
    supabase
      .from("scenes")
      .select("id, approved_scout_image_url")
      .eq("project_id", id),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id")
      .eq("project_id", id),
  ]);

  // Only count characters that are cast (have an approved headshot) and not voice-only
  const castable = (charsRes.data || []).filter(
    (c) => c.approved_cast_id !== null && !c.voice_only
  );
  const lockedChars = castable.filter((c) => c.locked);

  const allLocations = locationsRes.data || [];
  const approvedLocations = allLocations.filter((l) => !!l.approved_image_url);

  const allScenes = scenesRes.data || [];
  const scoutedScenes = allScenes.filter((s) => !!s.approved_scout_image_url);

  const allPanels = panelsRes.data || [];
  const scenesWithPanels = new Set(allPanels.map((p) => p.scene_id));
  const scenesWithPanelCount = allScenes.filter((s) => scenesWithPanels.has(s.id)).length;

  const checks = {
    characters_locked: {
      done: lockedChars.length,
      total: castable.length,
      ok: castable.length > 0 && lockedChars.length === castable.length,
    },
    locations_approved: {
      done: approvedLocations.length,
      total: allLocations.length,
      ok: allLocations.length > 0 && approvedLocations.length === allLocations.length,
    },
    scenes_scouted: {
      done: scoutedScenes.length,
      total: allScenes.length,
      ok: allScenes.length > 0 && scoutedScenes.length === allScenes.length,
    },
    scenes_have_panels: {
      done: scenesWithPanelCount,
      total: allScenes.length,
      ok: allScenes.length > 0 && scenesWithPanelCount === allScenes.length,
    },
  };

  const ready_for_first_frames =
    checks.characters_locked.ok &&
    checks.locations_approved.ok &&
    checks.scenes_scouted.ok &&
    checks.scenes_have_panels.ok;

  return NextResponse.json({
    ready_for_first_frames,
    total_panels: allPanels.length,
    checks,
  });
}
