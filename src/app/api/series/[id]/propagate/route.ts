import { createRouteClient } from "@/lib/supabase-route";
import { promoteElementToSeries, propagateSeriesEntity } from "@/lib/series-propagation";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/series/:id/propagate  { element_id }
 *
 * The "change once, update everywhere" action. Promotes the element to the
 * series library, then — for a character or environment — re-points every
 * episode's matching entity row to it and QUEUES fresh element keyframes for the
 * affected shots (non-destructive: current frames stay until the new ones land).
 * Props/outfits are inherited automatically by the registry, so they only promote.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.element_id) return NextResponse.json({ error: "element_id required" }, { status: 400 });

  try {
    // Resolve the element first (need kind/name/uuid).
    const { data: el, error } = await supabase
      .from("project_elements")
      .select("kind, name, higgsfield_element_id")
      .eq("id", body.element_id)
      .single();
    if (error || !el) return NextResponse.json({ error: "element not found" }, { status: 404 });

    const promoted = await promoteElementToSeries(supabase, id, body.element_id as string);

    // Re-point + flag only for entities that have per-episode rows.
    if (el.kind === "character" || el.kind === "environment") {
      const entityKind = el.kind === "character" ? "character" : "location";
      const propagation = await propagateSeriesEntity(
        supabase,
        id,
        entityKind,
        el.name,
        promoted.seriesElementId,
        (el.higgsfield_element_id as string) || null
      );
      return NextResponse.json({ success: true, promoted, propagation });
    }

    // prop / outfit → inherited via the registry; nothing to re-point.
    return NextResponse.json({
      success: true,
      promoted,
      propagation: { episodesAffected: 0, entitiesRepointed: 0, shotsQueued: 0, perEpisode: [], note: `${el.kind} inherited by all episodes via the series registry` },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /does not exist|could not find|schema cache/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
