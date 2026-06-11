import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Phase 11 — Video Assembly (FINAL_VISION.md).
 *
 * MVP assembly is manifest-based: the ordered list of clips (scene order,
 * panel order) is stored on the assembled_videos row and the watch page
 * plays them back-to-back with scene transitions. A stitched single-file
 * export (ffmpeg) can later set video_url on the same row without changing
 * the data model — Vercel functions can't run ffmpeg, so file stitching
 * happens locally or via a cloud assembler.
 */

interface ManifestEntry {
  clip_id: string;
  video_url: string;
  duration: number | null;
  scene_number: number;
  panel_number: number;
}

// GET /api/projects/:id/assembly — latest assembled videos (full + per-scene)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("assembled_videos")
    .select("id, scope, scene_id, video_url, manifest, duration_seconds, clip_count, status, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latestFull = (data || []).find((v) => v.scope === "full") || null;
  return NextResponse.json({ assemblies: data || [], latest_full: latestFull });
}

// POST /api/projects/:id/assembly — assemble approved/completed clips into
// per-scene manifests + one full-project manifest.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const force = body.force === true;

  const [clipsRes, panelsRes, scenesRes] = await Promise.all([
    supabase
      .from("video_clips")
      .select("id, panel_id, status, video_url, duration_seconds, covered_panel_ids")
      .eq("project_id", id)
      .in("status", ["approved", "completed"])
      .not("video_url", "is", null),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id, panel_number")
      .eq("project_id", id),
    supabase
      .from("scenes")
      .select("id, scene_number")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
  ]);

  const clips = clipsRes.data || [];
  if (clips.length === 0) {
    return NextResponse.json({ error: "No completed clips with video to assemble" }, { status: 400 });
  }

  const panelById: Record<string, { scene_id: string; panel_number: number }> = {};
  for (const p of panelsRes.data || []) panelById[p.id] = { scene_id: p.scene_id, panel_number: p.panel_number };
  const sceneNumberById: Record<string, number> = {};
  for (const s of scenesRes.data || []) sceneNumberById[s.id] = s.scene_number;

  // Best clip per panel: approved wins over completed; newest among equals
  const bestByPanel: Record<string, (typeof clips)[number]> = {};
  for (const clip of clips) {
    const existing = bestByPanel[clip.panel_id];
    if (!existing) {
      bestByPanel[clip.panel_id] = clip;
      continue;
    }
    const existingApproved = existing.status === "approved";
    const clipApproved = clip.status === "approved";
    if (clipApproved && !existingApproved) bestByPanel[clip.panel_id] = clip;
    else if (clipApproved === existingApproved) bestByPanel[clip.panel_id] = clip; // later row wins (created_at asc order not guaranteed here, but rows arrive insertion-ordered)
  }

  // Build the full manifest in (scene_number, panel_number) order
  const manifest: ManifestEntry[] = Object.values(bestByPanel)
    .map((clip) => {
      const panel = panelById[clip.panel_id];
      if (!panel || !clip.video_url) return null;
      return {
        clip_id: clip.id,
        video_url: clip.video_url,
        duration: clip.duration_seconds ? Number(clip.duration_seconds) : null,
        scene_number: sceneNumberById[panel.scene_id] ?? 9999,
        panel_number: panel.panel_number,
      };
    })
    .filter((m): m is ManifestEntry => m !== null)
    .sort((a, b) => (a.scene_number - b.scene_number) || (a.panel_number - b.panel_number));

  if (manifest.length === 0) {
    return NextResponse.json({ error: "No clips could be mapped to panels" }, { status: 400 });
  }

  // Coverage validation (diagnostic v2 fix 13). Sequence clips cover
  // their absorbed sibling panels too. Below 30% the cut is mostly holes —
  // block unless force:true; below 70% assemble but warn.
  const totalPanels = (panelsRes.data || []).length;
  const coveredPanelIds = new Set<string>();
  for (const clip of Object.values(bestByPanel)) {
    coveredPanelIds.add(clip.panel_id);
    for (const cid of ((clip as { covered_panel_ids?: string[] }).covered_panel_ids || [])) {
      coveredPanelIds.add(cid);
    }
  }
  const coverage = totalPanels > 0 ? coveredPanelIds.size / totalPanels : 1;
  if (coverage < 0.3 && !force) {
    return NextResponse.json(
      {
        error: `Only ${coveredPanelIds.size}/${totalPanels} panels (${Math.round(coverage * 100)}%) have clips — assembling now would be mostly holes. Generate more clips or pass force:true.`,
        coverage: Math.round(coverage * 100),
      },
      { status: 400 }
    );
  }
  const coverageWarning =
    coverage < 0.7
      ? `${totalPanels - coveredPanelIds.size} of ${totalPanels} panels have no clip — the cut will skip those beats`
      : null;

  const totalDuration = manifest.reduce((acc, m) => acc + (m.duration || 0), 0);

  // Per-scene assemblies
  const sceneGroups: Record<number, ManifestEntry[]> = {};
  for (const m of manifest) {
    if (!sceneGroups[m.scene_number]) sceneGroups[m.scene_number] = [];
    sceneGroups[m.scene_number].push(m);
  }
  const sceneIdByNumber: Record<number, string> = {};
  for (const s of scenesRes.data || []) sceneIdByNumber[s.scene_number] = s.id;

  const inserts = [
    {
      project_id: id,
      scope: "full",
      scene_id: null as string | null,
      manifest,
      duration_seconds: totalDuration,
      clip_count: manifest.length,
      status: "ready",
    },
    ...Object.entries(sceneGroups).map(([sceneNum, entries]) => ({
      project_id: id,
      scope: "scene",
      scene_id: sceneIdByNumber[Number(sceneNum)] || null,
      manifest: entries,
      duration_seconds: entries.reduce((acc, m) => acc + (m.duration || 0), 0),
      clip_count: entries.length,
      status: "ready",
    })),
  ];

  const { data: created, error: insertErr } = await supabase
    .from("assembled_videos")
    .insert(inserts)
    .select("id, scope, scene_id, clip_count, duration_seconds");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const full = (created || []).find((v) => v.scope === "full");
  return NextResponse.json({
    success: true,
    assembled_video_id: full?.id || null,
    clip_count: manifest.length,
    duration_seconds: totalDuration,
    scene_count: Object.keys(sceneGroups).length,
    coverage: Math.round(coverage * 100),
    warning: coverageWarning,
  });
}
