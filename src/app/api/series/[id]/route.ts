import { createRouteClient } from "@/lib/supabase-route";
import { loadEpisodeStatus } from "@/lib/episode-status";
import { notMigrated } from "@/lib/series-util";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/series/:id — series detail: ordered episodes each with full status +
// thumbnail frame id + the series asset-library summary.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: series, error } = await supabase
    .from("series")
    .select("id, title, bible_text, setting_profile, created_at, updated_at")
    .eq("id", id)
    .single();
  if (error) {
    if (notMigrated(error)) return NextResponse.json({ migrated: false, error: "Series not migrated" }, { status: 409 });
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  const { data: episodes } = await supabase
    .from("projects")
    .select("id, title, episode_number, phase_status, aspect_ratio, updated_at")
    .eq("series_id", id)
    .eq("archived", false);

  // Order by episode_number (nulls last), then created order.
  const ordered = (episodes || []).sort((a, b) => {
    const an = a.episode_number ?? 9999;
    const bn = b.episode_number ?? 9999;
    return an - bn;
  });

  const withStatus = await Promise.all(
    ordered.map(async (ep) => ({
      id: ep.id,
      title: ep.title,
      episode_number: ep.episode_number,
      aspect_ratio: ep.aspect_ratio,
      status: await loadEpisodeStatus(supabase, { id: ep.id, phase_status: ep.phase_status }),
    }))
  );

  // Series asset library (metadata only — no base64).
  const { data: elements } = await supabase
    .from("project_elements")
    .select("id, kind, name, status, higgsfield_element_id")
    .eq("series_id", id)
    .eq("active", true);

  const completeCount = withStatus.filter((e) => e.status.stage === "complete").length;

  return NextResponse.json({
    migrated: true,
    series,
    episodes: withStatus,
    rollup: { total: withStatus.length, complete: completeCount, watchable: withStatus.filter((e) => e.status.watchable).length },
    elements: elements || [],
  });
}

// PATCH /api/series/:id — attach/detach an episode, reorder, or edit the bible.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  // Edit the shared bible / setting profile
  if (body.bible_text !== undefined || body.setting_profile !== undefined) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.bible_text !== undefined) update.bible_text = body.bible_text;
    if (body.setting_profile !== undefined) update.setting_profile = body.setting_profile;
    const { error } = await supabase.from("series").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: notMigrated(error) ? 409 : 500 });
  }

  // Attach a project as an episode
  if (body.attach_project_id) {
    const { error } = await supabase
      .from("projects")
      .update({ series_id: id, episode_number: body.episode_number ?? null })
      .eq("id", body.attach_project_id);
    if (error) return NextResponse.json({ error: error.message }, { status: notMigrated(error) ? 409 : 500 });
  }

  // Detach a project
  if (body.detach_project_id) {
    const { error } = await supabase
      .from("projects")
      .update({ series_id: null, episode_number: null })
      .eq("id", body.detach_project_id)
      .eq("series_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: notMigrated(error) ? 409 : 500 });
  }

  // Reorder episodes
  if (Array.isArray(body.reorder)) {
    for (const r of body.reorder as Array<{ project_id: string; episode_number: number }>) {
      await supabase.from("projects").update({ episode_number: r.episode_number }).eq("id", r.project_id).eq("series_id", id);
    }
  }

  return NextResponse.json({ success: true });
}
