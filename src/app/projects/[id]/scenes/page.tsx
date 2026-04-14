"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface SceneVariation {
  id: string;
  scene_id: string;
  status: "pending" | "approved" | "rejected";
  variation_number: number;
}

interface ScoutScene {
  id: string;
  scene_number: number;
  location: string;
  time_of_day: string;
  mood: string;
  action_summary: string;
  scene_type: string;
  characters_present: string[];
  locked: boolean;
  variations: SceneVariation[];
}

const SCENE_TYPE_COLORS: Record<string, string> = {
  real:      "var(--brand-gray)",
  dream:     "#9B7EDE",
  fantasy:   "#7EDE9B",
  flashback: "#DE9B7E",
  montage:   "#7E9BDE",
};

export default function SceneScoutingPage() {
  const { id } = useParams<{ id: string }>();
  const [scenes, setScenes] = useState<ScoutScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genScene, setGenScene] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [locking, setLocking] = useState(false);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/scenes`);
    if (res.ok) {
      const data = await res.json();
      const s: ScoutScene[] = data.scenes || [];
      setScenes(s);
      if (!selectedScene && s.length > 0) {
        setSelectedScene(s[0].id);
      }
    }
    setLoading(false);
  }, [id, selectedScene]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy-load variation images for the selected scene
  const fetchSceneImage = useCallback(async (variationId: string) => {
    if (imageCache[variationId] || loadingImages.has(variationId)) return;
    setLoadingImages((prev) => new Set(prev).add(variationId));
    try {
      const res = await fetch(`/api/projects/${id}/scenes/image?variation_id=${variationId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.image_url) {
          setImageCache((prev) => ({ ...prev, [variationId]: data.image_url }));
        }
      }
    } catch { /* silent */ } finally {
      setLoadingImages((prev) => { const n = new Set(prev); n.delete(variationId); return n; });
    }
  }, [id, imageCache, loadingImages]);

  // Fetch images when selected scene changes
  useEffect(() => {
    if (!selectedScene) return;
    const scene = scenes.find((s) => s.id === selectedScene);
    if (!scene) return;
    for (const v of scene.variations) {
      fetchSceneImage(v.id);
    }
  }, [selectedScene, scenes, fetchSceneImage]);

  const generateVariations = async (sceneId?: string) => {
    setGenerating(true);
    setGenError(null);
    if (sceneId) setGenScene(sceneId);
    try {
      const res = await fetch(`/api/projects/${id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sceneId ? { scene_id: sceneId } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGenError(data.error || `Generation failed (${res.status})`);
      }
    } catch {
      setGenError("Network error. Please check your connection and try again.");
    }
    await fetchData();
    setGenerating(false);
    setGenScene(null);
  };

  const updateVariation = async (
    variationId: string,
    sceneId: string,
    status: "approved" | "rejected",
    rejectionNote?: string
  ) => {
    await fetch(`/api/projects/${id}/scenes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variation_id: variationId,
        scene_id: sceneId,
        status,
        rejection_note: rejectionNote || null,
      }),
    });
    setRejectingId(null);
    setRejectNote("");
    await fetchData();
  };

  const lockAll = async () => {
    setLocking(true);
    await fetch(`/api/projects/${id}/scenes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock_all: true }),
    });
    await fetchData();
    setLocking(false);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading scenes...
      </div>
    );
  }

  const activeScene = scenes.find((s) => s.id === selectedScene);
  const unscouted = scenes.filter((s) => s.variations.length === 0);
  const hasVariations = scenes.some((s) => s.variations.length > 0);
  const allApproved = scenes.length > 0 && scenes.every((s) => s.variations.some((v) => v.status === "approved"));
  const allLocked = scenes.length > 0 && scenes.every((s) => s.locked);

  return (
    <>
      <ProjectNav projectId={id} />
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-7xl mx-auto px-6 py-12">

          {/* Header */}
          <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link
              href={`/projects/${id}`}
              className="text-[10px] uppercase tracking-[0.25em] transition-colors"
              style={{ color: "var(--brand-orange)" }}
            >
              &larr; Back to Project
            </Link>
            <div className="flex items-end justify-between mt-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                  Scene Scouting
                </h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  {scenes.length} scenes &middot; 3 atmospheric reference images each &middot; approve the best visual for each scene
                </p>
              </div>
              <div className="flex gap-3">
                {unscouted.length > 0 && (
                  <button
                    onClick={() => generateVariations()}
                    disabled={generating}
                    className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                    style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {generating
                      ? "Generating..."
                      : hasVariations
                      ? `Scout Remaining (${unscouted.length})`
                      : `Scout All Scenes (${scenes.length})`}
                  </button>
                )}
                {allApproved && !allLocked && (
                  <button
                    onClick={lockAll}
                    disabled={locking}
                    className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-5 py-2.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                  >
                    {locking ? "Locking..." : "Lock All Scenes"}
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Error banner */}
          {genError && (
            <div
              className="p-4 mb-6 rounded-xl flex items-center justify-between"
              style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}
            >
              <p className="text-red-400 text-xs">{genError}</p>
              <button
                onClick={() => setGenError(null)}
                className="text-red-500 text-[10px] uppercase tracking-widest border border-red-900/50 px-3 py-1 hover:bg-red-950/30 transition-colors ml-4 flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {scenes.length === 0 ? (
            <div
              className="rounded-xl p-12 text-center"
              style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
            >
              <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No scenes found</p>
              <p className="text-xs mb-6" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                Run extraction from the project page to generate scenes from your script.
              </p>
              <Link
                href={`/projects/${id}`}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              >
                Go to Project &rarr;
              </Link>
            </div>
          ) : (
            <div className="flex gap-8">
              {/* Scene sidebar */}
              <nav className="w-60 flex-shrink-0 space-y-1">
                <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                  Scenes
                </p>
                <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                  {scenes.map((scene) => {
                    const isSelected = selectedScene === scene.id;
                    const approved = scene.variations.some((v) => v.status === "approved");
                    const hasPending = scene.variations.some((v) => v.status === "pending");
                    const hasVars = scene.variations.length > 0;

                    return (
                      <button
                        key={scene.id}
                        onClick={() => setSelectedScene(scene.id)}
                        className="w-full text-left px-4 py-3 rounded-lg transition-colors"
                        style={{
                          border: isSelected ? "1px solid var(--brand-orange)" : "1px solid var(--brand-steel)",
                          background: isSelected ? "rgba(255,138,42,0.08)" : "var(--brand-mid)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="text-xs font-medium"
                            style={{ color: isSelected ? "var(--brand-orange)" : "var(--brand-white)" }}
                          >
                            Scene {scene.scene_number}
                          </span>
                          {scene.locked ? (
                            <span className="text-green-500 text-[9px] uppercase ml-1">LOCKED</span>
                          ) : approved ? (
                            <span className="text-[9px] uppercase ml-1" style={{ color: "var(--brand-orange)" }}>APPROVED</span>
                          ) : hasPending && hasVars ? (
                            <span className="text-[9px] uppercase ml-1" style={{ color: "var(--brand-gray)" }}>REVIEW</span>
                          ) : null}
                        </div>
                        <p
                          className="text-[10px] mt-0.5 truncate"
                          style={{ color: "var(--brand-gray)", opacity: 0.7 }}
                        >
                          {scene.location || "—"}
                        </p>
                        {scene.scene_type && scene.scene_type !== "real" && (
                          <span
                            className="inline-block text-[9px] uppercase tracking-wider mt-1 px-1.5 py-0.5"
                            style={{
                              color: SCENE_TYPE_COLORS[scene.scene_type] || "var(--brand-gray)",
                              border: `1px solid ${SCENE_TYPE_COLORS[scene.scene_type] || "var(--brand-steel)"}20`,
                            }}
                          >
                            {scene.scene_type}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>

              {/* Main content */}
              {activeScene && (
                <div className="flex-1 min-w-0">
                  {/* Scene info header */}
                  <div className="mb-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <h2 className="text-xl font-semibold" style={{ color: "var(--brand-white)" }}>
                            Scene {activeScene.scene_number}
                          </h2>
                          {activeScene.time_of_day && (
                            <span
                              className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                            >
                              {activeScene.time_of_day}
                            </span>
                          )}
                          {activeScene.mood && (
                            <span
                              className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                              style={{ color: "var(--brand-orange)", opacity: 0.7, border: "1px solid rgba(255,138,42,0.25)" }}
                            >
                              {activeScene.mood}
                            </span>
                          )}
                          {activeScene.scene_type && activeScene.scene_type !== "real" && (
                            <span
                              className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                              style={{
                                color: SCENE_TYPE_COLORS[activeScene.scene_type] || "var(--brand-gray)",
                                border: `1px solid ${SCENE_TYPE_COLORS[activeScene.scene_type] || "var(--brand-steel)"}`,
                              }}
                            >
                              {activeScene.scene_type}
                            </span>
                          )}
                        </div>

                        {activeScene.location && (
                          <p className="text-xs mb-2" style={{ color: "var(--brand-orange)", opacity: 0.8 }}>
                            📍 {activeScene.location}
                          </p>
                        )}

                        <p className="text-xs leading-relaxed max-w-2xl" style={{ color: "var(--brand-gray)" }}>
                          {activeScene.action_summary}
                        </p>

                        {activeScene.characters_present?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {activeScene.characters_present.map((name, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-0.5"
                                style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex-shrink-0 flex gap-2">
                        {activeScene.variations.length === 0 && (
                          <button
                            onClick={() => generateVariations(activeScene.id)}
                            disabled={generating}
                            className="text-xs uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
                            style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {generating && genScene === activeScene.id ? "Generating..." : "Scout This Scene"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Variation grid */}
                  {activeScene.variations.length > 0 ? (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        {activeScene.variations.map((v) => (
                          <div
                            key={v.id}
                            className="rounded-xl overflow-hidden transition-colors"
                            style={{
                              border: v.status === "approved"
                                ? "1px solid rgba(34,197,94,0.5)"
                                : v.status === "rejected"
                                ? "1px solid rgba(239,68,68,0.15)"
                                : "1px solid var(--brand-steel)",
                              background: v.status === "approved" ? "rgba(34,197,94,0.05)" : "var(--brand-mid)",
                              opacity: v.status === "rejected" ? 0.35 : 1,
                            }}
                          >
                            {/* Image */}
                            <div className="aspect-video relative overflow-hidden" style={{ background: "var(--brand-navy)" }}>
                              {imageCache[v.id] ? (
                                <img
                                  src={imageCache[v.id]}
                                  alt={`Scene ${activeScene.scene_number} variation ${v.variation_number}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full animate-pulse rounded" style={{ background: "var(--brand-steel)" }} />
                              )}
                              <span className="absolute top-2 left-2 text-[9px] bg-black/60 text-neutral-400 px-1.5 py-0.5">
                                #{v.variation_number}
                              </span>
                              {v.status === "approved" && (
                                <span className="absolute top-2 right-2 text-[9px] bg-green-900/80 text-green-300 px-2 py-0.5 uppercase tracking-widest">
                                  Approved
                                </span>
                              )}
                            </div>

                            {/* Approve / reject */}
                            {v.status === "pending" && (
                              <div className="flex" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                                <button
                                  onClick={() => updateVariation(v.id, activeScene.id, "approved")}
                                  className="flex-1 py-2.5 text-[10px] uppercase tracking-widest text-green-500 hover:bg-green-950/20 transition-colors"
                                >
                                  Approve
                                </button>
                                <div style={{ width: "1px", background: "var(--brand-steel)" }} />
                                <button
                                  onClick={() => setRejectingId(v.id)}
                                  className="flex-1 py-2.5 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-950/20 transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            )}

                            {rejectingId === v.id && (
                              <div className="p-3" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                                <input
                                  type="text"
                                  value={rejectNote}
                                  onChange={(e) => setRejectNote(e.target.value)}
                                  placeholder="Rejection note (optional)"
                                  className="w-full px-2 py-1.5 text-xs focus:outline-none mb-2"
                                  style={{
                                    background: "transparent",
                                    border: "1px solid var(--brand-steel)",
                                    color: "var(--brand-white)",
                                  }}
                                />
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => updateVariation(v.id, activeScene.id, "rejected", rejectNote)}
                                    className="flex-1 py-1.5 text-[10px] uppercase text-red-500 border border-red-900/50 hover:bg-red-950/20 transition-colors"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectNote(""); }}
                                    className="flex-1 py-1.5 text-[10px] uppercase transition-colors"
                                    style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Regenerate slot */}
                        {activeScene.variations.length > 0 && !activeScene.variations.some((v) => v.status === "approved") && (
                          <div
                            className="rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                            style={{
                              border: "2px dashed var(--brand-steel)",
                              minHeight: "160px",
                            }}
                            onClick={() => !generating && generateVariations(activeScene.id)}
                          >
                            <div className="text-center px-4">
                              <p className="text-xs mb-1" style={{ color: "var(--brand-gray)" }}>
                                {generating && genScene === activeScene.id ? "Generating…" : "Regenerate"}
                              </p>
                              <p className="text-[10px]" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                                Try new variations
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Generating overlay for this scene */}
                      {generating && genScene === activeScene.id && (
                        <div
                          className="rounded-xl p-8 text-center"
                          style={{ border: "1px solid rgba(255,138,42,0.25)", background: "rgba(255,138,42,0.04)" }}
                        >
                          <div className="flex items-center justify-center gap-3 mb-3">
                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "0ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "150ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "300ms" }} />
                          </div>
                          <p className="text-xs uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                            Generating new scout images…
                          </p>
                        </div>
                      )}
                    </>
                  ) : generating && genScene === activeScene.id ? (
                    <div
                      className="rounded-xl p-12 text-center"
                      style={{ border: "1px solid rgba(255,138,42,0.25)", background: "rgba(255,138,42,0.04)" }}
                    >
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "300ms" }} />
                      </div>
                      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--brand-orange)" }}>
                        Scouting scene {activeScene.scene_number}…
                      </p>
                      <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                        Generating 3 atmospheric reference images. This takes about 30 seconds.
                      </p>
                    </div>
                  ) : (
                    <div
                      className="rounded-xl p-12 text-center"
                      style={{ border: "2px dashed var(--brand-steel)" }}
                    >
                      <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No scout images yet</p>
                      <button
                        onClick={() => generateVariations(activeScene.id)}
                        disabled={generating}
                        className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40 mt-2"
                        style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        Scout This Scene
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Generating all — global loader */}
          {generating && !genScene && (
            <div
              className="mt-6 rounded-xl p-10 text-center"
              style={{ border: "1px solid rgba(255,138,42,0.25)", background: "rgba(255,138,42,0.04)" }}
            >
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "300ms" }} />
              </div>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-orange)" }}>Scouting all scenes</p>
              <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                Generating 3 atmospheric images per scene — {scenes.length * 3} total. This may take a few minutes.
              </p>
            </div>
          )}

          {/* Phase complete footer — show once every scene has an approved variation,
              even if not yet locked. Locking is optional for moving to storyboard. */}
          {allApproved && scenes.length > 0 && (
            <div
              className="mt-10 pt-8 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--brand-steel)" }}
            >
              <div>
                <p className="text-sm text-green-400">
                  {allLocked ? "All scenes scouted and locked" : "All scenes scouted"}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                  Approved visuals will be used to enrich storyboard panel generation.
                  {!allLocked && " (Locking is optional — you can proceed without it.)"}
                </p>
              </div>
              <Link
                href={`/projects/${id}/storyboard`}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                Continue to Storyboard &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
