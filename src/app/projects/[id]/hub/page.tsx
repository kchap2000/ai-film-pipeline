"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";
import DirectorChat from "@/components/DirectorChat";
import type { RevisionPlan } from "@/lib/revision";

/**
 * REVISION_VISION R4+R5 — the Project Workspace.
 *
 * One interface for everything the pipeline produced — even in Auto Mode:
 * Cast (every variation + current pick, recast-after-lock), Locations &
 * Scenes (swap the approved image), Elements (versions, regenerate),
 * Films (every assembled version + revision history). Every change ends
 * with the cascade banner: "this affects N shots — regenerate & build a
 * new version", which feeds the same Revision Engine as Director's Notes.
 */

type Tab = "readiness" | "cast" | "locations" | "scenes" | "elements" | "films";

interface ReadinessReport {
  characters: Array<{ name: string; role: string; has_description: boolean; has_headshot: boolean; locked: boolean; has_pose_sheet: boolean; has_element: boolean }>;
  locations: Array<{ name: string; has_reference: boolean; locked: boolean; has_element: boolean }>;
  scenes: Array<{ scene_number: number; has_scout: boolean; panel_count: number }>;
  summary: { auto_generate: number; needs_you: string[]; gaps: string[]; start_step: string; ready_to_run: boolean; provided_locked: number };
}

interface VariationMeta {
  id: string;
  status: string;
  variation_number: number;
}
interface HubCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  voice_only: boolean;
  locked: boolean;
  approved_cast_id: string | null;
  higgsfield_element_id: string | null;
  has_pose_sheet: boolean;
  version: number;
  variations: VariationMeta[];
}
interface HubLocation {
  id: string;
  name: string;
  description: string;
  mood: string;
  locked: boolean;
  has_approved_image: boolean;
  version: number;
  variations: VariationMeta[];
}
interface HubScene {
  id: string;
  scene_number: number;
  location: string;
  mood: string;
  action_summary: string;
  locked: boolean;
  has_approved_scout: boolean;
  panel_count: number;
  version: number;
  variations: VariationMeta[];
}
interface HubElement {
  id: string;
  kind: string;
  name: string;
  status: string;
  scene_numbers: number[];
  higgsfield_element_id: string | null;
  ref_image_url: string | null;
  version: number;
  active: boolean;
}
interface HubFilm {
  id: string;
  version: number;
  label: string | null;
  status: string;
  clip_count: number;
  duration_seconds: number | null;
  video_url: string | null;
  revision_id: string | null;
  changelog: Array<{ action: string; reason: string }> | null;
  created_at: string;
}
interface HubRevision {
  id: string;
  status: string;
  raw_feedback: Array<{ text: string; via: string }>;
  plan: { summary?: string } | null;
  qa_verify: { score: number; notes: string } | null;
  created_at: string;
}

interface CascadeState {
  sourceType: "character" | "location" | "scene" | "element";
  sourceId: string;
  label: string;
}

export default function HubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("readiness");
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [runningGaps, setRunningGaps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<HubCharacter[]>([]);
  const [locations, setLocations] = useState<HubLocation[]>([]);
  const [scenes, setScenes] = useState<HubScene[]>([]);
  const [elements, setElements] = useState<HubElement[]>([]);
  const [films, setFilms] = useState<HubFilm[]>([]);
  const [revisions, setRevisions] = useState<HubRevision[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Image lazy-loading (CLAUDE.md pattern — bulk responses carry no images)
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  // Cascade banner + plan confirm state
  const [cascade, setCascade] = useState<CascadeState | null>(null);
  const [cascadePlan, setCascadePlan] = useState<{ revisionId: string; plan: RevisionPlan } | null>(null);
  const [cascadeBusy, setCascadeBusy] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/hub`);
    if (!res.ok) {
      setError("Could not load the workspace");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setCharacters(data.characters || []);
    setLocations(data.locations || []);
    setScenes(data.scenes || []);
    setElements(data.elements || []);
    setFilms(data.films || []);
    setRevisions(data.revisions || []);
    setLoading(false);
    // readiness / gap report (ASSET INTAKE I3)
    fetch(`/api/projects/${id}/readiness-report`).then((r) => r.ok ? r.json() : null).then((rr) => rr && setReadiness(rr)).catch(() => {});
  }, [id]);

  const fillGapsAndRun = async () => {
    if (!readiness || runningGaps) return;
    setRunningGaps(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/auto-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", start_from_step: readiness.summary.start_step }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not start the run");
      router.push(`/projects/${id}/pipeline`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunningGaps(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadImage = useCallback(
    async (key: string, url: string, extract: (data: Record<string, string | null>) => string | null) => {
      if (imageCache[key] || loadingImages.has(key)) return;
      setLoadingImages((prev) => new Set(prev).add(key));
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const img = extract(data);
          if (img) setImageCache((prev) => ({ ...prev, [key]: img }));
        }
      } finally {
        setLoadingImages((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
    },
    [imageCache, loadingImages]
  );

  // Load the images the current tab needs (never during render — setState
  // in the render path loops). Approved images always; variation grids
  // only for the expanded card.
  useEffect(() => {
    if (tab === "cast") {
      for (const c of characters) {
        if (c.approved_cast_id) {
          loadImage(`char-${c.id}`, `/api/projects/${id}/cast/image?variation_id=${c.approved_cast_id}`, (d) => d.image_url);
        }
        if (expanded === c.id) {
          for (const v of c.variations) {
            loadImage(`var-${v.id}`, `/api/projects/${id}/cast/image?variation_id=${v.id}`, (d) => d.image_url);
          }
        }
      }
    } else if (tab === "locations") {
      for (const l of locations) {
        if (l.has_approved_image) {
          loadImage(`loc-${l.id}`, `/api/projects/${id}/locations/image?location_id=${l.id}&type=approved`, (d) => d.approved_image_url);
        }
        if (expanded === l.id) {
          for (const v of l.variations) {
            loadImage(`locvar-${v.id}`, `/api/projects/${id}/locations/image?variation_id=${v.id}`, (d) => d.image_url);
          }
        }
      }
    } else if (tab === "scenes") {
      for (const s of scenes) {
        if (s.has_approved_scout) {
          loadImage(`scene-${s.id}`, `/api/projects/${id}/scenes/image?scene_id=${s.id}&type=approved`, (d) => d.approved_scout_image_url);
        }
        if (expanded === s.id) {
          for (const v of s.variations) {
            loadImage(`scenevar-${v.id}`, `/api/projects/${id}/scenes/image?variation_id=${v.id}`, (d) => d.image_url);
          }
        }
      }
    }
  }, [tab, expanded, characters, locations, scenes, id, loadImage]);

  // ── Actions ─────────────────────────────────────────────────
  const act = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const patchJson = async (path: string, body: Record<string, unknown>, method = "PATCH") => {
    const res = await fetch(`/api/projects/${id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
    return data;
  };

  const unlockCharacter = (c: HubCharacter) =>
    act(`unlock-${c.id}`, async () => {
      await patchJson(`/lock`, { character_id: c.id, unlock: true });
    });

  const relockCharacter = (c: HubCharacter) =>
    act(`lock-${c.id}`, async () => {
      await patchJson(`/lock`, { character_id: c.id });
      setCascade({ sourceType: "character", sourceId: c.id, label: c.name });
    });

  const recastTo = (c: HubCharacter, variationId: string) =>
    act(`recast-${variationId}`, async () => {
      if (c.locked) await patchJson(`/lock`, { character_id: c.id, unlock: true });
      await patchJson(`/cast`, { variation_id: variationId, status: "approved", character_id: c.id });
      await patchJson(`/lock`, { character_id: c.id });
      // The swapped headshot invalidates the pose sheet — regenerate it
      // in the cascade run; flag downstream now.
      setImageCache((prev) => {
        const n = { ...prev };
        delete n[`char-${c.id}`];
        return n;
      });
      setCascade({ sourceType: "character", sourceId: c.id, label: c.name });
    });

  const regeneratePoseSheet = (c: HubCharacter) =>
    act(`pose-${c.id}`, async () => {
      await patchJson(`/posesheet`, { character_id: c.id }, "POST");
    });

  const swapLocationImage = (l: HubLocation, variationId: string) =>
    act(`swaploc-${variationId}`, async () => {
      await patchJson(`/locations`, { variation_id: variationId, status: "approved", location_id: l.id });
      setImageCache((prev) => {
        const n = { ...prev };
        delete n[`loc-${l.id}`];
        return n;
      });
      setCascade({ sourceType: "location", sourceId: l.id, label: l.name });
    });

  const swapSceneImage = (s: HubScene, variationId: string) =>
    act(`swapscene-${variationId}`, async () => {
      await patchJson(`/scenes`, { variation_id: variationId, status: "approved", scene_id: s.id });
      setImageCache((prev) => {
        const n = { ...prev };
        delete n[`scene-${s.id}`];
        return n;
      });
      setCascade({ sourceType: "scene", sourceId: s.id, label: `Scene ${s.scene_number}` });
    });

  const regenerateElement = (e: HubElement) =>
    act(`elgen-${e.id}`, async () => {
      await patchJson(`/elements`, { action: "generate_image", element_id: e.id }, "POST");
      setCascade({ sourceType: "element", sourceId: e.id, label: e.name });
    });

  const newElementVersion = (e: HubElement) =>
    act(`elver-${e.id}`, async () => {
      const data = await patchJson(`/elements`, { action: "new_version", element_id: e.id }, "POST");
      if (data.element_id) {
        await patchJson(`/elements`, { action: "generate_image", element_id: data.element_id }, "POST");
        setCascade({ sourceType: "element", sourceId: data.element_id, label: e.name });
      }
    });

  const setElementActive = (e: HubElement) =>
    act(`elact-${e.id}`, async () => {
      await patchJson(`/elements`, { action: "set_active", element_id: e.id }, "POST");
      setCascade({ sourceType: "element", sourceId: e.id, label: e.name });
    });

  // ── Cascade: build plan → confirm → run ─────────────────────
  const buildCascade = async () => {
    if (!cascade || cascadeBusy) return;
    setCascadeBusy(true);
    setError(null);
    try {
      const data = await patchJson(
        `/revisions`,
        { cascade: { source_type: cascade.sourceType, source_id: cascade.sourceId } },
        "POST"
      );
      setCascadePlan({ revisionId: data.revision.id, plan: data.plan });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCascadeBusy(false);
    }
  };

  const runCascade = async () => {
    if (!cascadePlan || cascadeBusy) return;
    setCascadeBusy(true);
    try {
      await patchJson(`/revisions`, { revision_id: cascadePlan.revisionId, action: "approve" });
      router.push(`/projects/${id}/pipeline`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCascadeBusy(false);
    }
  };

  const statusColor = (status: string) =>
    status === "approved" ? "#4ade80" : status === "superseded" ? "var(--brand-cyan)" : status === "rejected" ? "#f87171" : "var(--brand-gray)";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Loading workspace…
      </div>
    );
  }

  const TABS: Array<{ key: Tab; label: string; count: number }> = [
    { key: "readiness", label: "Readiness", count: readiness?.summary.auto_generate ?? 0 },
    { key: "cast", label: "Cast", count: characters.length },
    { key: "locations", label: "Locations", count: locations.length },
    { key: "scenes", label: "Scenes", count: scenes.length },
    { key: "elements", label: "Elements", count: elements.length },
    { key: "films", label: "Films", count: films.length },
  ];

  return (
    <>
      <ProjectNav projectId={id} />
      <div className="min-h-screen pb-24" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          <header className="pb-6 mb-6" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>Workspace</h1>
            <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
              Everything the pipeline produced — recast, swap, and version any of it. Changes cascade through a targeted revision run.
            </p>
          </header>

          {/* Tabs */}
          <div className="flex gap-2 mb-8 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setExpanded(null); }}
                className="text-[10px] uppercase tracking-widest px-4 py-2.5 rounded flex-shrink-0 transition-colors"
                style={{
                  color: tab === t.key ? "var(--brand-orange)" : "var(--brand-gray)",
                  border: tab === t.key ? "1px solid rgba(255,138,42,0.5)" : "1px solid var(--brand-steel)",
                  background: tab === t.key ? "rgba(255,138,42,0.06)" : "var(--brand-mid)",
                }}
              >
                {t.label} <span style={{ color: "var(--brand-steel)" }}>· {t.count}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-md px-4 py-3 mb-6 text-xs flex items-center justify-between" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              {error}
              <button onClick={() => setError(null)} className="ml-3">✕</button>
            </div>
          )}

          {/* ── Cascade banner ─────────────────────────────── */}
          {cascade && !cascadePlan && (
            <div className="rounded-xl px-5 py-4 mb-6 flex items-center justify-between gap-4 flex-wrap" style={{ background: "rgba(255,138,42,0.06)", border: "1px solid rgba(255,138,42,0.4)" }}>
              <p className="text-xs" style={{ color: "var(--brand-white)" }}>
                <strong>{cascade.label}</strong> changed — downstream shots are now stale.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={buildCascade}
                  disabled={cascadeBusy}
                  className="text-[10px] uppercase tracking-widest px-4 py-2 disabled:opacity-40"
                  style={{ background: "var(--brand-orange)", color: "var(--brand-navy)", fontWeight: 700 }}
                >
                  {cascadeBusy ? "Checking impact…" : "Regenerate affected & build new version"}
                </button>
                <button
                  onClick={() => setCascade(null)}
                  className="text-[10px] uppercase tracking-widest px-3 py-2"
                  style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                >
                  Later
                </button>
              </div>
            </div>
          )}
          {cascadePlan && (
            <div className="rounded-xl px-5 py-4 mb-6" style={{ background: "var(--brand-mid)", border: "1px solid rgba(255,138,42,0.4)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--brand-white)" }}>{cascadePlan.plan.summary}</p>
              <p className="text-[11px] mb-3" style={{ color: "var(--brand-orange)" }}>
                {cascadePlan.plan.estimated_units.frames} frames + {cascadePlan.plan.estimated_units.clips} clips will regenerate.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={runCascade}
                  disabled={cascadeBusy}
                  className="text-[10px] uppercase tracking-widest px-4 py-2 disabled:opacity-40"
                  style={{ background: "var(--brand-orange)", color: "var(--brand-navy)", fontWeight: 700 }}
                >
                  {cascadeBusy ? "Starting…" : "Run it"}
                </button>
                <button
                  onClick={() => { setCascadePlan(null); setCascade(null); }}
                  className="text-[10px] uppercase tracking-widest px-3 py-2"
                  style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── READINESS (ASSET INTAKE I3) ────────────────── */}
          {tab === "readiness" && (
            readiness ? (
              <div className="space-y-6">
                <div className="rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap" style={{ background: "var(--brand-mid)", border: `1px solid ${readiness.summary.ready_to_run ? "rgba(74,222,128,0.4)" : "rgba(255,138,42,0.4)"}` }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "var(--brand-white)" }}>
                      {readiness.summary.ready_to_run ? "Ready to build" : "Gaps before run-ready"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                      {readiness.summary.provided_locked} locked from your assets · {readiness.summary.auto_generate} pieces the system will auto-generate · {readiness.summary.needs_you.length} need you
                    </p>
                  </div>
                  <button onClick={fillGapsAndRun} disabled={runningGaps} className="text-xs uppercase tracking-widest px-5 py-2.5 disabled:opacity-40" style={{ background: "var(--brand-orange)", color: "var(--brand-navy)", fontWeight: 700 }}>
                    {runningGaps ? "Starting…" : `Fill gaps & run`}
                  </button>
                </div>
                {readiness.summary.needs_you.length > 0 && (
                  <div className="rounded-md px-4 py-3 text-[11px]" style={{ background: "rgba(255,138,42,0.06)", border: "1px solid rgba(255,138,42,0.3)", color: "var(--brand-orange)" }}>
                    {readiness.summary.needs_you.map((n, i) => <div key={i}>⚠ {n}</div>)}
                  </div>
                )}
                {/* characters grid */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Characters — desc · headshot · pose · element</p>
                  <div className="space-y-1.5">
                    {readiness.characters.map((c) => {
                      const dot = (ok: boolean, you?: boolean) => <span style={{ color: ok ? (you ? "var(--brand-cyan)" : "#4ade80") : "var(--brand-gray)" }}>{ok ? (you ? "✓ yours" : "✓") : "→ gen"}</span>;
                      return (
                        <div key={c.name} className="flex items-center justify-between px-3 py-2 rounded text-[11px]" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                          <span style={{ color: "var(--brand-white)" }}>{c.name} <span style={{ color: "var(--brand-steel)" }}>· {c.role}</span></span>
                          <span className="flex gap-4">{dot(c.has_description)}{dot(c.has_headshot, c.locked)}{dot(c.has_pose_sheet, c.locked && c.has_pose_sheet)}{dot(c.has_element, c.has_element)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* locations grid */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Locations — reference · element</p>
                  <div className="space-y-1.5">
                    {readiness.locations.map((l) => (
                      <div key={l.name} className="flex items-center justify-between px-3 py-2 rounded text-[11px]" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                        <span style={{ color: "var(--brand-white)" }}>{l.name}</span>
                        <span className="flex gap-4">
                          <span style={{ color: l.has_reference ? (l.locked ? "var(--brand-cyan)" : "#4ade80") : "var(--brand-gray)" }}>{l.has_reference ? (l.locked ? "✓ yours" : "✓") : "→ scout"}</span>
                          <span style={{ color: l.has_element ? "#4ade80" : "var(--brand-gray)" }}>{l.has_element ? "✓" : "→ derive"}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px]" style={{ color: "var(--brand-gray)" }}>
                  {readiness.scenes.length} scenes · {readiness.scenes.filter((s) => s.panel_count > 0).length} storyboarded. Provided assets are locked and never regenerated; “Fill gaps & run” starts the pipeline at <strong style={{ color: "var(--brand-white)" }}>{readiness.summary.start_step.replace(/_/g, " ")}</strong>.
                </p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--brand-gray)" }}>Computing readiness…</p>
            )
          )}

          {/* ── CAST ───────────────────────────────────────── */}
          {tab === "cast" && (
            <div className="space-y-4">
              {characters.filter((c) => !c.voice_only).map((c) => {
                const headshotKey = `char-${c.id}`;
                const isExpanded = expanded === c.id;
                return (
                  <div key={c.id} className="rounded-xl p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                        {imageCache[headshotKey] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageCache[headshotKey]} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg font-bold" style={{ color: "var(--brand-steel)" }}>{c.name[0]}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold" style={{ color: "var(--brand-white)" }}>{c.name}</h3>
                          <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.35)" }}>{c.role}</span>
                          {c.locked && <span className="text-[9px] uppercase tracking-widest text-green-400">🔒 locked</span>}
                          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-steel)" }}>v{c.version}</span>
                          {c.higgsfield_element_id && <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>element ✓</span>}
                          {c.has_pose_sheet && <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>pose sheet ✓</span>}
                        </div>
                        <p className="text-[11px] mt-1 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{c.description}</p>
                        <div className="flex gap-2 mt-3 flex-wrap">
                          <button
                            onClick={() => setExpanded(isExpanded ? null : c.id)}
                            className="text-[9px] uppercase tracking-widest px-3 py-1.5"
                            style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                          >
                            {isExpanded ? "Hide" : "Recast"} ({c.variations.length} options)
                          </button>
                          {c.locked ? (
                            <button onClick={() => unlockCharacter(c)} disabled={!!busy} className="text-[9px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40" style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}>
                              {busy === `unlock-${c.id}` ? "Unlocking…" : "Unlock"}
                            </button>
                          ) : c.approved_cast_id ? (
                            <button onClick={() => relockCharacter(c)} disabled={!!busy} className="text-[9px] uppercase tracking-widest px-3 py-1.5 text-green-400 border border-green-800/50 disabled:opacity-40">
                              {busy === `lock-${c.id}` ? "Locking…" : "Lock"}
                            </button>
                          ) : null}
                          <button onClick={() => regeneratePoseSheet(c)} disabled={!!busy || !c.approved_cast_id} className="text-[9px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40" style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}>
                            {busy === `pose-${c.id}` ? "Generating…" : "Regen pose sheet"}
                          </button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                        {c.variations.map((v) => {
                          const vKey = `var-${v.id}`;
                          const isCurrent = v.id === c.approved_cast_id;
                          return (
                            <div key={v.id} className="rounded-lg overflow-hidden" style={{ border: isCurrent ? "2px solid #4ade80" : "1px solid var(--brand-steel)" }}>
                              <div className="aspect-square flex items-center justify-center" style={{ background: "var(--brand-navy)" }}>
                                {imageCache[vKey] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={imageCache[vKey]} alt={`Variation ${v.variation_number}`} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] animate-pulse" style={{ color: "var(--brand-steel)" }}>…</span>
                                )}
                              </div>
                              <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: "var(--brand-navy)" }}>
                                <span className="text-[8px] uppercase tracking-widest" style={{ color: statusColor(v.status) }}>
                                  {isCurrent ? "current" : v.status}
                                </span>
                                {!isCurrent && v.status !== "rejected" && (
                                  <button
                                    onClick={() => recastTo(c, v.id)}
                                    disabled={!!busy}
                                    className="text-[8px] uppercase tracking-widest disabled:opacity-40"
                                    style={{ color: "var(--brand-orange)" }}
                                  >
                                    {busy === `recast-${v.id}` ? "…" : "Use this"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── LOCATIONS ──────────────────────────────────── */}
          {tab === "locations" && (
            <div className="space-y-4">
              {locations.map((l) => {
                const key = `loc-${l.id}`;
                const isExpanded = expanded === l.id;
                return (
                  <div key={l.id} className="rounded-xl p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-start gap-4">
                      <div className="w-28 h-20 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                        {imageCache[key] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageCache[key]} alt={l.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[9px]" style={{ color: "var(--brand-steel)" }}>{l.has_approved_image ? "…" : "no image"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold" style={{ color: "var(--brand-white)" }}>{l.name}</h3>
                          {l.locked && <span className="text-[9px] uppercase tracking-widest text-green-400">🔒</span>}
                          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-steel)" }}>v{l.version}</span>
                        </div>
                        <p className="text-[11px] mt-1 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{l.description}</p>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : l.id)}
                          className="text-[9px] uppercase tracking-widest px-3 py-1.5 mt-3"
                          style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                        >
                          {isExpanded ? "Hide" : "Swap image"} ({l.variations.length} options)
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                        {l.variations.map((v) => {
                          const vKey = `locvar-${v.id}`;
                          const isCurrent = v.status === "approved";
                          return (
                            <div key={v.id} className="rounded-lg overflow-hidden" style={{ border: isCurrent ? "2px solid #4ade80" : "1px solid var(--brand-steel)" }}>
                              <div className="aspect-video flex items-center justify-center" style={{ background: "var(--brand-navy)" }}>
                                {imageCache[vKey] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={imageCache[vKey]} alt={`Variation ${v.variation_number}`} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] animate-pulse" style={{ color: "var(--brand-steel)" }}>…</span>
                                )}
                              </div>
                              <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: "var(--brand-navy)" }}>
                                <span className="text-[8px] uppercase tracking-widest" style={{ color: statusColor(v.status) }}>
                                  {isCurrent ? "current" : v.status}
                                </span>
                                {!isCurrent && v.status !== "rejected" && (
                                  <button onClick={() => swapLocationImage(l, v.id)} disabled={!!busy} className="text-[8px] uppercase tracking-widest disabled:opacity-40" style={{ color: "var(--brand-orange)" }}>
                                    {busy === `swaploc-${v.id}` ? "…" : "Use this"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SCENES ─────────────────────────────────────── */}
          {tab === "scenes" && (
            <div className="space-y-4">
              {scenes.map((s) => {
                const key = `scene-${s.id}`;
                const isExpanded = expanded === s.id;
                return (
                  <div key={s.id} className="rounded-xl p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-start gap-4">
                      <div className="w-28 h-20 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                        {imageCache[key] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageCache[key]} alt={`Scene ${s.scene_number}`} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[9px]" style={{ color: "var(--brand-steel)" }}>{s.has_approved_scout ? "…" : "no scout"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold" style={{ color: "var(--brand-white)" }}>Scene {s.scene_number}</h3>
                          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>@ {s.location}</span>
                          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-steel)" }}>{s.panel_count} shots · v{s.version}</span>
                        </div>
                        <p className="text-[11px] mt-1 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{s.action_summary}</p>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : s.id)}
                          className="text-[9px] uppercase tracking-widest px-3 py-1.5 mt-3"
                          style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                        >
                          {isExpanded ? "Hide" : "Swap scout image"} ({s.variations.length} options)
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="grid grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                        {s.variations.map((v) => {
                          const vKey = `scenevar-${v.id}`;
                          const isCurrent = v.status === "approved";
                          return (
                            <div key={v.id} className="rounded-lg overflow-hidden" style={{ border: isCurrent ? "2px solid #4ade80" : "1px solid var(--brand-steel)" }}>
                              <div className="aspect-video flex items-center justify-center" style={{ background: "var(--brand-navy)" }}>
                                {imageCache[vKey] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={imageCache[vKey]} alt={`Variation ${v.variation_number}`} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[9px] animate-pulse" style={{ color: "var(--brand-steel)" }}>…</span>
                                )}
                              </div>
                              <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: "var(--brand-navy)" }}>
                                <span className="text-[8px] uppercase tracking-widest" style={{ color: statusColor(v.status) }}>
                                  {isCurrent ? "current" : v.status}
                                </span>
                                {!isCurrent && v.status !== "rejected" && (
                                  <button onClick={() => swapSceneImage(s, v.id)} disabled={!!busy} className="text-[8px] uppercase tracking-widest disabled:opacity-40" style={{ color: "var(--brand-orange)" }}>
                                    {busy === `swapscene-${v.id}` ? "…" : "Use this"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ELEMENTS ───────────────────────────────────── */}
          {tab === "elements" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {elements.length === 0 && (
                <p className="text-xs col-span-full" style={{ color: "var(--brand-gray)" }}>
                  No elements yet — they&apos;re derived from the script during an auto run (props, outfits, environments that recur across scenes).
                </p>
              )}
              {elements.map((e) => (
                <div key={e.id} className="rounded-xl overflow-hidden" style={{ background: "var(--brand-mid)", border: e.active ? "1px solid var(--brand-steel)" : "1px dashed var(--brand-steel)", opacity: e.active ? 1 : 0.65 }}>
                  <div className="aspect-video flex items-center justify-center" style={{ background: "var(--brand-navy)" }}>
                    {e.ref_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.ref_image_url} alt={e.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[9px]" style={{ color: "var(--brand-steel)" }}>no reference yet</span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}>{e.kind}</span>
                      <h3 className="text-xs font-bold" style={{ color: "var(--brand-white)" }}>{e.name}</h3>
                    </div>
                    <p className="text-[9px] uppercase tracking-widest mt-2" style={{ color: "var(--brand-gray)" }}>
                      v{e.version}{e.active ? " · active" : " · inactive"} · {e.status.replace(/_/g, " ")}
                      {e.scene_numbers?.length ? ` · scenes ${e.scene_numbers.join(",")}` : ""}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button onClick={() => regenerateElement(e)} disabled={!!busy} className="text-[8px] uppercase tracking-widest px-2.5 py-1.5 disabled:opacity-40" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}>
                        {busy === `elgen-${e.id}` ? "Generating…" : "Regen reference"}
                      </button>
                      <button onClick={() => newElementVersion(e)} disabled={!!busy} className="text-[8px] uppercase tracking-widest px-2.5 py-1.5 disabled:opacity-40" style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}>
                        {busy === `elver-${e.id}` ? "Versioning…" : "New version"}
                      </button>
                      {!e.active && (
                        <button onClick={() => setElementActive(e)} disabled={!!busy} className="text-[8px] uppercase tracking-widest px-2.5 py-1.5 text-green-400 border border-green-800/50 disabled:opacity-40">
                          {busy === `elact-${e.id}` ? "…" : "Make active"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── FILMS ──────────────────────────────────────── */}
          {tab === "films" && (
            <div className="space-y-6">
              <div className="space-y-3">
                {films.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--brand-gray)" }}>No assembled films yet.</p>
                )}
                {films.map((f) => (
                  <div key={f.id} className="rounded-xl p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold" style={{ color: "var(--brand-white)" }}>
                            v{f.version}{f.label ? ` — ${f.label}` : ""}
                          </h3>
                          {f.video_url && <span className="text-[9px] uppercase tracking-widest text-green-400">stitched</span>}
                          {f.revision_id && <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>from revision</span>}
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: "var(--brand-gray)" }}>
                          {f.clip_count} clips · ~{Math.round(Number(f.duration_seconds) || 0)}s · {new Date(f.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/projects/${id}/video/watch`} className="text-[9px] uppercase tracking-widest px-3 py-2" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}>
                          Screening Room →
                        </Link>
                        {f.video_url && (
                          <a href={f.video_url} download className="text-[9px] uppercase tracking-widest px-3 py-2" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}>
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                    {f.changelog && f.changelog.length > 0 && (
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                        {f.changelog.map((c, i) => (
                          <p key={i} className="text-[10px] mb-0.5" style={{ color: "var(--brand-gray)" }}>
                            <span className="uppercase tracking-widest mr-2" style={{ color: "var(--brand-cyan)" }}>{c.action.replace(/_/g, " ")}</span>
                            {c.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Revision history */}
              {revisions.length > 0 && (
                <section>
                  <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>Revision History</h2>
                  <div className="space-y-2">
                    {revisions.map((r) => (
                      <div key={r.id} className="rounded-lg px-4 py-3" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded" style={{
                            color: r.status === "done" ? "#4ade80" : r.status === "failed" ? "#f87171" : r.status === "running" ? "var(--brand-orange)" : "var(--brand-gray)",
                            border: "1px solid var(--brand-steel)",
                          }}>
                            {r.status}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--brand-gray)" }}>{new Date(r.created_at).toLocaleString()}</span>
                          {r.qa_verify && (
                            <span className="text-[10px]" style={{ color: r.qa_verify.score >= 80 ? "#4ade80" : "var(--brand-orange)" }}>
                              verify {r.qa_verify.score}/100
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] mt-1.5" style={{ color: "var(--brand-white)" }}>
                          {r.plan?.summary || (r.raw_feedback || []).map((n) => n.text).join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
      <DirectorChat projectId={id} currentPage="hub" onActionComplete={fetchData} />
    </>
  );
}
