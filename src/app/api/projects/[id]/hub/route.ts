import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * REVISION_VISION R4 — Project Workspace summary.
 *
 * One slim payload for the /hub page: every character, location, scene,
 * element, film version and revision — METADATA ONLY. Image columns are
 * base64 (500KB–1MB each) and NEVER selected in bulk (CLAUDE.md rule);
 * the hub lazy-loads images through the existing per-item /image routes.
 * "Has an image" booleans use the ids-only trick: select id where the
 * image column is not null.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    projectRes,
    charsRes,
    castVarsRes,
    poseSheetIdsRes,
    locsRes,
    locApprovedIdsRes,
    locVarsRes,
    scenesRes,
    sceneApprovedIdsRes,
    sceneVarsRes,
    panelsRes,
    elementsRes,
    filmsRes,
    revisionsRes,
    clipsRes,
  ] = await Promise.all([
    supabase.from("projects").select("id, title, phase_status, mode, aspect_ratio, version").eq("id", id).single(),
    supabase
      .from("characters")
      .select("id, name, role, personality, description, voice_only, locked, approved_cast_id, higgsfield_element_id, version")
      .eq("project_id", id)
      .order("name"),
    supabase
      .from("cast_variations")
      .select("id, character_id, status, variation_number, created_at")
      .eq("project_id", id)
      .order("variation_number"),
    supabase.from("characters").select("id").eq("project_id", id).not("pose_sheet_url", "is", null),
    supabase
      .from("locations")
      .select("id, name, description, time_of_day, mood, locked, higgsfield_element_id, version")
      .eq("project_id", id)
      .order("name"),
    supabase.from("locations").select("id").eq("project_id", id).not("approved_image_url", "is", null),
    supabase
      .from("location_variations")
      .select("id, location_id, status, variation_number, created_at")
      .eq("project_id", id)
      .order("variation_number"),
    supabase
      .from("scenes")
      .select("id, scene_number, location, location_id, time_of_day, mood, action_summary, characters_present, locked, version")
      .eq("project_id", id)
      .order("scene_number"),
    supabase.from("scenes").select("id").eq("project_id", id).not("approved_scout_image_url", "is", null),
    supabase
      .from("scene_variations")
      .select("id, scene_id, status, variation_number, created_at")
      .eq("project_id", id)
      .order("variation_number"),
    supabase.from("storyboard_panels").select("id, scene_id, panel_number").eq("project_id", id),
    supabase
      .from("project_elements")
      .select("id, kind, name, status, scene_numbers, higgsfield_element_id, ref_image_url, version, parent_element_id, active, created_at")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("assembled_videos")
      .select("id, scope, version, label, status, clip_count, duration_seconds, video_url, revision_id, parent_assembly_id, changelog, created_at")
      .eq("project_id", id)
      .eq("scope", "full")
      .order("created_at", { ascending: false }),
    supabase.from("revisions").select("id, status, raw_feedback, plan, result_assembly_id, qa_verify, created_at").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("video_clips").select("id, panel_id, status, covered_panel_ids").eq("project_id", id).in("status", ["approved", "completed", "pending"]),
  ]);

  if (!projectRes.data) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const poseSheetIds = new Set((poseSheetIdsRes.data || []).map((r) => r.id));
  const locApprovedIds = new Set((locApprovedIdsRes.data || []).map((r) => r.id));
  const sceneApprovedIds = new Set((sceneApprovedIdsRes.data || []).map((r) => r.id));

  // Group variations by parent
  const castByChar: Record<string, unknown[]> = {};
  for (const v of castVarsRes.data || []) {
    (castByChar[v.character_id] = castByChar[v.character_id] || []).push(v);
  }
  const varsByLocation: Record<string, unknown[]> = {};
  for (const v of locVarsRes.data || []) {
    (varsByLocation[v.location_id] = varsByLocation[v.location_id] || []).push(v);
  }
  const varsByScene: Record<string, unknown[]> = {};
  for (const v of sceneVarsRes.data || []) {
    (varsByScene[v.scene_id] = varsByScene[v.scene_id] || []).push(v);
  }
  const panelsByScene: Record<string, number> = {};
  for (const p of panelsRes.data || []) {
    panelsByScene[p.scene_id] = (panelsByScene[p.scene_id] || 0) + 1;
  }

  // Clip coverage per scene (Films tab stats)
  const coveredPanels = new Set<string>();
  for (const c of clipsRes.data || []) {
    coveredPanels.add(c.panel_id);
    for (const cid of (c.covered_panel_ids as string[] | null) || []) coveredPanels.add(cid);
  }

  return NextResponse.json({
    project: projectRes.data,
    characters: (charsRes.data || []).map((c) => ({
      ...c,
      has_pose_sheet: poseSheetIds.has(c.id),
      variations: castByChar[c.id] || [],
    })),
    locations: (locsRes.data || []).map((l) => ({
      ...l,
      has_approved_image: locApprovedIds.has(l.id),
      variations: varsByLocation[l.id] || [],
    })),
    scenes: (scenesRes.data || []).map((s) => ({
      ...s,
      has_approved_scout: sceneApprovedIds.has(s.id),
      panel_count: panelsByScene[s.id] || 0,
      variations: varsByScene[s.id] || [],
    })),
    elements: elementsRes.data || [],
    films: filmsRes.data || [],
    revisions: revisionsRes.data || [],
    stats: {
      total_panels: (panelsRes.data || []).length,
      panels_with_clips: Array.from(coveredPanels).length,
    },
  });
}
