import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * ASSET INTAKE (I3) — per-entity readiness / gap report.
 *
 * The in-app version of `scripts/intake.mjs`'s readiness table: for every
 * character / location / scene, what's present (provided or generated) vs what
 * the pipeline still needs to build, plus the earliest step "Fill gaps & run"
 * would start from. Metadata only — never selects image columns (CLAUDE.md);
 * presence is computed via `<col> is not null`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [charsRes, poseRes, locsRes, locApprovedRes, scenesRes, sceneScoutRes, panelsRes] = await Promise.all([
    supabase.from("characters").select("id, name, role, description, voice_only, locked, approved_cast_id, higgsfield_element_id").eq("project_id", id).order("name"),
    supabase.from("characters").select("id").eq("project_id", id).not("pose_sheet_url", "is", null),
    supabase.from("locations").select("id, name, locked, higgsfield_element_id").eq("project_id", id).order("name"),
    supabase.from("locations").select("id").eq("project_id", id).not("approved_image_url", "is", null),
    supabase.from("scenes").select("id, scene_number").eq("project_id", id).order("scene_number"),
    supabase.from("scenes").select("id").eq("project_id", id).not("approved_scout_image_url", "is", null),
    supabase.from("storyboard_panels").select("id, scene_id, approved_first_frame_id").eq("project_id", id),
  ]);

  const poseIds = new Set((poseRes.data || []).map((r) => r.id));
  const locApprovedIds = new Set((locApprovedRes.data || []).map((r) => r.id));
  const sceneScoutIds = new Set((sceneScoutRes.data || []).map((r) => r.id));
  const panelsByScene: Record<string, number> = {};
  let framedPanels = 0;
  for (const p of panelsRes.data || []) {
    panelsByScene[p.scene_id] = (panelsByScene[p.scene_id] || 0) + 1;
    if (p.approved_first_frame_id) framedPanels++;
  }

  const hasDesc = (d: string | null) => !!d && !/no physical description|awaiting production/i.test(d);
  const gaps: string[] = [];
  const needsYou: string[] = [];

  const characters = (charsRes.data || []).filter((c) => !c.voice_only).map((c) => {
    const headshot = !!c.approved_cast_id;
    const pose = poseIds.has(c.id);
    const element = !!c.higgsfield_element_id;
    if (!hasDesc(c.description)) needsYou.push(`${c.name}: no physical description`);
    if (!headshot) gaps.push(`cast ${c.name}`);
    if (!pose) gaps.push(`pose ${c.name}`);
    if (!element) gaps.push(`element ${c.name}`);
    return { name: c.name, role: c.role, has_description: hasDesc(c.description), has_headshot: headshot, locked: c.locked, has_pose_sheet: pose, has_element: element };
  });

  const locations = (locsRes.data || []).map((l) => {
    const ref = locApprovedIds.has(l.id);
    if (!ref) gaps.push(`scout ${l.name}`);
    return { name: l.name, has_reference: ref, locked: l.locked, has_element: !!l.higgsfield_element_id };
  });

  const scenes = (scenesRes.data || []).map((s) => ({
    scene_number: s.scene_number,
    has_scout: sceneScoutIds.has(s.id),
    panel_count: panelsByScene[s.id] || 0,
  }));
  const scenesWithoutScout = scenes.filter((s) => !s.has_scout).length;
  const scenesWithoutPanels = scenes.filter((s) => s.panel_count === 0).length;
  if (scenesWithoutPanels > 0) gaps.push(`storyboard (${scenesWithoutPanels} scenes)`);

  const totalPanels = (panelsRes.data || []).length;
  const framesNeeded = totalPanels - framedPanels;

  const startStep =
    characters.some((c) => !c.has_headshot) ? "cast_generate" :
    locations.some((l) => !l.has_reference) ? "locations_generate" :
    scenesWithoutScout > 0 ? "scenes_generate" :
    scenesWithoutPanels > 0 ? "storyboard" :
    framesNeeded > 0 ? "first_frames" : "video_clips";

  return NextResponse.json({
    characters,
    locations,
    scenes,
    summary: {
      auto_generate: gaps.length,
      needs_you: needsYou,
      gaps,
      start_step: startStep,
      ready_to_run: needsYou.length === 0,
      provided_locked:
        characters.filter((c) => c.has_headshot && c.locked).length +
        locations.filter((l) => l.has_reference && l.locked).length,
    },
  });
}
