"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import EpisodeTile, { EpisodeTileData } from "@/components/EpisodeTile";

interface SeriesDetail {
  migrated?: boolean;
  series: { id: string; title: string; bible_text: string | null };
  episodes: EpisodeTileData[];
  rollup: { total: number; complete: number; watchable: number };
  elements: Array<{ id: string; kind: string; name: string; status: string; higgsfield_element_id: string | null }>;
}

export default function SeriesPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [data, setData] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [propagating, setPropagating] = useState<string | null>(null);
  const [propResult, setPropResult] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/series/${id}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  async function propagate(elementId: string, name: string) {
    setPropagating(elementId);
    setPropResult(null);
    try {
      const r = await fetch(`/api/series/${id}/propagate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_id: elementId }),
      });
      const j = await r.json();
      if (j.success) {
        const p = j.propagation || {};
        setPropResult(
          `“${name}” propagated → ${p.episodesAffected || 0} episode(s), ${p.entitiesRepointed || 0} re-pointed, ${p.shotsQueued || 0} shot(s) queued for regen with the new reference (current frames stay until rebuilt).` +
          (p.note ? ` (${p.note})` : "")
        );
        load();
      } else {
        setPropResult(j.error || "propagation failed");
      }
    } catch (e) {
      setPropResult(e instanceof Error ? e.message : "propagation failed");
    } finally {
      setPropagating(null);
    }
  }

  if (loading) {
    return <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-6xl mx-auto px-6 py-12 text-sm" style={{ color: "var(--brand-gray)" }}>Loading series…</div>
    </div>;
  }
  if (!data || data.migrated === false || !data.series) {
    return <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Link href="/" className="text-xs" style={{ color: "var(--brand-cyan)" }}>← Overview</Link>
        <p className="mt-6 text-sm" style={{ color: "var(--brand-gray)" }}>
          Series tables aren’t migrated yet. Apply <code>supabase/migrations/2026-06-23_series_library.sql</code> to enable the series view.
        </p>
      </div>
    </div>;
  }

  const { series, episodes, rollup, elements } = data;

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Link href="/" className="text-xs" style={{ color: "var(--brand-cyan)" }}>← Overview</Link>

        <header className="mt-4 mb-8">
          <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: "var(--brand-orange)", opacity: 0.8 }}>Series</p>
          <h1 className="text-4xl font-black tracking-tight" style={{ color: "var(--brand-white)" }}>{series.title}</h1>
          <p className="text-sm mt-3" style={{ color: "var(--brand-gray)" }}>
            {rollup.total} episode{rollup.total === 1 ? "" : "s"} · {rollup.complete} complete · {rollup.watchable} watchable
          </p>
        </header>

        {/* Episode lineup */}
        {episodes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--brand-gray)" }}>No episodes attached yet. Ingest one with <code>intake.mjs --series-id {series.id}</code> or attach an existing project.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {episodes.map((ep) => <EpisodeTile key={ep.id} ep={ep} />)}
          </div>
        )}

        {/* Series asset library + propagate */}
        {elements.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>Series asset library</h2>
            {propResult && (
              <div className="mb-3 text-xs px-3 py-2 rounded-lg" style={{ background: "var(--brand-mid)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}>{propResult}</div>
            )}
            <div className="flex flex-col gap-2">
              {elements.map((el) => (
                <div key={el.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                     style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded" style={{ background: "var(--brand-navy)", color: "var(--brand-cyan)" }}>{el.kind}</span>
                    <span className="text-sm truncate" style={{ color: "var(--brand-white)" }}>{el.name}</span>
                    {el.higgsfield_element_id && <span className="text-[10px]" style={{ color: "#46c46a" }}>● linked</span>}
                  </div>
                  <button
                    onClick={() => propagate(el.id, el.name)}
                    disabled={propagating === el.id}
                    className="text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--brand-orange)", color: "#0B1C2D" }}>
                    {propagating === el.id ? "Propagating…" : "Propagate to all episodes"}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] mt-2" style={{ color: "var(--brand-gray)" }}>
              Propagate re-points every episode to this asset and flags the shots that showed the old version for regen.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
