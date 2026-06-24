/**
 * series-propagation.ts — cross-episode "change once, update everywhere".
 *
 * When a series-level asset changes (a recast, a new element version, a swapped
 * location), every episode that uses it must re-point AND the shots that showed
 * the old version get rebuilt. This is NON-DESTRUCTIVE: re-point the
 * character/location element ids across all episodes, then QUEUE fresh element
 * keyframes for the affected shots. The currently-approved frame stays in place
 * (episode remains watchable) until the new connector-fulfilled keyframe is
 * approved, at which point it supersedes the old one. Nothing is deleted.
 * (Covering clips rebuild on the episode's next video pass off the new frame.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { planElementKeyframes } from "@/lib/element-keyframes";

export interface PromoteResult {
  seriesElementId: string;
  name: string;
  kind: string;
}

/**
 * Lift a proven PROJECT element to SERIES scope (reuse its higgsfield_element_id
 * — no re-creation). Returns the new series-scoped element row id. Idempotent on
 * (series_id, kind, name): updates the existing active series element if present.
 */
export async function promoteElementToSeries(
  supabase: SupabaseClient,
  seriesId: string,
  elementId: string
): Promise<PromoteResult> {
  const { data: el, error } = await supabase
    .from("project_elements")
    .select("kind, name, match_terms, description, ref_image_url, higgsfield_element_id")
    .eq("id", elementId)
    .single();
  if (error || !el) throw new Error("element not found");

  const row = {
    series_id: seriesId,
    project_id: null,
    kind: el.kind,
    name: el.name,
    match_terms: el.match_terms || [el.name],
    description: el.description || null,
    ref_image_url: el.ref_image_url || null,
    higgsfield_element_id: el.higgsfield_element_id || null,
    status: el.higgsfield_element_id ? "element_ready" : "image_ready",
    active: true,
  };

  const { data: existing } = await supabase
    .from("project_elements")
    .select("id, higgsfield_element_id, status")
    .eq("series_id", seriesId)
    .eq("kind", el.kind)
    .eq("name", el.name)
    .eq("active", true)
    .maybeSingle();

  let seriesElementId: string;
  if (existing) {
    // Never DOWNGRADE a trained series element: if the existing series row is
    // already element_ready (has a Higgsfield id) and the source lacks one,
    // keep the trained id/status — only refresh the descriptive fields.
    const upd: Record<string, unknown> = {
      match_terms: row.match_terms,
      description: row.description,
      ref_image_url: row.ref_image_url || existing.higgsfield_element_id ? row.ref_image_url : null,
      active: true,
    };
    if (row.higgsfield_element_id) {
      upd.higgsfield_element_id = row.higgsfield_element_id;
      upd.status = "element_ready";
    } else if (!existing.higgsfield_element_id) {
      upd.status = row.status;
    } // else: existing is trained, source isn't → preserve existing id + status
    await supabase.from("project_elements").update(upd).eq("id", existing.id);
    seriesElementId = existing.id;
  } else {
    const { data: ins, error: insErr } = await supabase.from("project_elements").insert(row).select("id").single();
    if (insErr || !ins) throw new Error(insErr?.message || "promote insert failed");
    seriesElementId = ins.id;
  }
  return { seriesElementId, name: el.name, kind: el.kind };
}

export interface PropagationResult {
  episodesAffected: number;
  entitiesRepointed: number;
  /** shots queued for regeneration with the new reference (non-destructive). */
  shotsQueued: number;
  perEpisode: Array<{ project_id: string; title: string; entities: number; shotsQueued: number }>;
}

/**
 * Re-point a character or location across every episode of a series to a
 * series-level element, then QUEUE fresh element keyframes for the shots that
 * depicted it — NON-DESTRUCTIVELY. The existing approved frame stays in place
 * (episode remains watchable) until the new connector-fulfilled keyframe is
 * generated and approved, at which point it supersedes the old one. Nothing is
 * deleted or orphaned. Matching is EXACT (case-insensitive) to avoid hitting
 * sibling entities ("Khalil" must not match "Khalilah").
 *
 * @param kind        "character" | "location"
 * @param name        entity name to match across episodes (exact, case-insensitive)
 * @param seriesElementId  project_elements id (series-scoped) to point to
 * @param elementUuid Higgsfield element id to write onto the entity rows
 */
export async function propagateSeriesEntity(
  supabase: SupabaseClient,
  seriesId: string,
  kind: "character" | "location",
  name: string,
  seriesElementId: string,
  elementUuid: string | null
): Promise<PropagationResult> {
  const { data: episodes } = await supabase
    .from("projects")
    .select("id, title")
    .eq("series_id", seriesId)
    .eq("archived", false);

  const result: PropagationResult = {
    episodesAffected: 0,
    entitiesRepointed: 0,
    shotsQueued: 0,
    perEpisode: [],
  };
  const target = name.toLowerCase().trim();
  const nameMatches = (n: string | null) => (n || "").toLowerCase().trim() === target;

  for (const ep of episodes || []) {
    // 1. Re-point the entity row(s) to the series element (exact name match).
    const tbl = kind === "character" ? "characters" : "locations";
    const { data: rows } = await supabase.from(tbl).select("id, name").eq("project_id", ep.id);
    const hits = (rows || []).filter((r) => nameMatches(r.name));
    if (hits.length === 0) continue; // entity not in this episode
    let entities = 0;
    for (const h of hits) {
      const upd: Record<string, unknown> = { series_element_id: seriesElementId };
      if (elementUuid) upd.higgsfield_element_id = elementUuid;
      await supabase.from(tbl).update(upd).eq("id", h.id);
      entities++;
    }

    // 2. Identify the affected shots (exact match), then QUEUE regeneration —
    // do NOT touch the currently-approved frame/clip.
    let affectedPanelIds: string[] = [];
    if (kind === "character") {
      const { data: panels } = await supabase
        .from("storyboard_panels")
        .select("id, characters_in_shot")
        .eq("project_id", ep.id);
      affectedPanelIds = (panels || [])
        .filter((p) => (p.characters_in_shot || []).some((c: string) => nameMatches(c)))
        .map((p) => p.id);
    } else {
      const { data: scenes } = await supabase.from("scenes").select("id, location").eq("project_id", ep.id);
      const sceneIds = (scenes || []).filter((s) => nameMatches(s.location)).map((s) => s.id);
      if (sceneIds.length > 0) {
        const { data: panels } = await supabase
          .from("storyboard_panels")
          .select("id")
          .eq("project_id", ep.id)
          .in("scene_id", sceneIds);
        affectedPanelIds = (panels || []).map((p) => p.id);
      }
    }

    let shotsQueued = 0;
    if (affectedPanelIds.length > 0) {
      // Queue fresh element keyframes for these panels with the new reference.
      // regen:true forces a new deferred frame even where one is already
      // approved; idempotent — re-runs skip panels that already have a pending
      // queued frame. The connector fulfills + approves, superseding the old.
      const planned = await planElementKeyframes(supabase, ep.id, { panelIds: affectedPanelIds, regen: true });
      shotsQueued = planned.planned;
    }

    result.episodesAffected++;
    result.entitiesRepointed += entities;
    result.shotsQueued += shotsQueued;
    result.perEpisode.push({ project_id: ep.id, title: ep.title, entities, shotsQueued });
  }

  return result;
}
