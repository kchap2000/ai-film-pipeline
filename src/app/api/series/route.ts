import { createRouteClient } from "@/lib/supabase-route";
import { notMigrated } from "@/lib/series-util";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Series container API. Degrades gracefully BEFORE the series migration is
 * applied: a missing-table/column error returns `{ series: [], migrated: false }`
 * so the dashboard shows the flat project grid and nothing breaks.
 */

// GET /api/series — list series with a light episode rollup.
export async function GET(_req: NextRequest) {
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: series, error } = await supabase
    .from("series")
    .select("id, title, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (notMigrated(error)) return NextResponse.json({ series: [], migrated: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Episode counts per series (cheap metadata-only join).
  const ids = (series || []).map((s) => s.id);
  const countByseries: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: eps } = await supabase
      .from("projects")
      .select("id, series_id")
      .in("series_id", ids)
      .eq("archived", false);
    for (const e of eps || []) {
      const sid = e.series_id as string;
      countByseries[sid] = (countByseries[sid] || 0) + 1;
    }
  }

  return NextResponse.json({
    migrated: true,
    series: (series || []).map((s) => ({ ...s, episode_count: countByseries[s.id] || 0 })),
  });
}

// POST /api/series — create a series. Body: { title, bible_text?, setting_profile? }
export async function POST(req: NextRequest) {
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = (body.title as string | undefined)?.trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("series")
    .insert({
      title,
      bible_text: (body.bible_text as string) || null,
      setting_profile: (body.setting_profile as Record<string, unknown>) || null,
    })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    if (notMigrated(error)) {
      return NextResponse.json(
        { error: "Series tables not migrated yet — apply supabase/migrations/2026-06-23_series_library.sql", migrated: false },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ series: { ...data, episode_count: 0 } });
}
