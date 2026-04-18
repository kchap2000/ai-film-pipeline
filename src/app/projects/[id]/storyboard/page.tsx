"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface Panel {
  id: string;
  scene_id: string;
  panel_number: number;
  shot_type: string;
  camera_angle: string;
  camera_movement: string;
  action_description: string;
  dialogue: string;
  characters_in_shot: string[];
  duration_seconds: number;
}

interface Scene {
  id: string;
  scene_number: number;
  location: string;
  time_of_day: string;
  mood: string;
  action_summary: string;
  characters_present: string[];
  panels: Panel[];
}

interface Character {
  id: string;
  name: string;
  voice_only: boolean;
  approved_variation_id: string | null;
}

export default function StoryboardPage() {
  const { id } = useParams<{ id: string }>();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [totalPanels, setTotalPanels] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genScene, setGenScene] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [panelImages, setPanelImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [headshots, setHeadshots] = useState<Record<string, string>>({});
  const cancelRef = useRef(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/storyboard`);
    if (res.ok) {
      const data = await res.json();
      setScenes(data.scenes || []);
      setCharacters(data.characters || []);
      setTotalPanels(data.totalPanels || 0);
      if (!expandedScene && data.scenes?.length > 0) {
        setExpandedScene(data.scenes[0].id);
      }
    }
    setLoading(false);
  }, [id, expandedScene]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy-load cast headshots
  useEffect(() => {
    for (const c of characters) {
      if (c.approved_variation_id && !headshots[c.id]) {
        fetch(`/api/projects/${id}/cast/image?variation_id=${c.approved_variation_id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.image_url) setHeadshots((prev) => ({ ...prev, [c.id]: d.image_url }));
          })
          .catch(() => {});
      }
    }
  }, [characters, id, headshots]);

  // Lazy-load panel images when a scene is expanded
  const fetchPanelImage = useCallback(async (panelId: string) => {
    if (panelImages[panelId] || loadingImages.has(panelId)) return;
    setLoadingImages((prev) => new Set(prev).add(panelId));
    try {
      const res = await fetch(`/api/projects/${id}/storyboard/panel-image?panel_id=${panelId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.image_url) {
          setPanelImages((prev) => ({ ...prev, [panelId]: data.image_url }));
        }
      }
    } catch {
      // silently fail — panel just won't have an image
    } finally {
      setLoadingImages((prev) => { const n = new Set(prev); n.delete(panelId); return n; });
    }
  }, [id, panelImages, loadingImages]);

  // When a scene is expanded, fetch images for its panels
  useEffect(() => {
    if (!expandedScene) return;
    const scene = scenes.find((s) => s.id === expandedScene);
    if (!scene) return;
    for (const panel of scene.panels) {
      fetchPanelImage(panel.id);
    }
  }, [expandedScene, scenes, fetchPanelImage]);

  const cancelGeneration = () => {
    cancelRef.current = true;
  };

  // Generate panels for a single scene, with one auto-retry on failure.
  // Returns { ok: true } or { ok: false, error: string }.
  const generateSceneWithRetry = useCallback(async (sceneId: string, sceneNumber: number): Promise<{ ok: boolean; error?: string }> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`/api/projects/${id}/storyboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene_id: sceneId }),
        });
        if (res.ok) return { ok: true };
        const data = await res.json().catch(() => ({}));
        if (attempt === 2) {
          return {
            ok: false,
            error: data.error || `Scene ${sceneNumber} failed after retry (${res.status}).`,
          };
        }
      } catch {
        if (attempt === 2) {
          return { ok: false, error: `Scene ${sceneNumber} failed after retry (network error).` };
        }
      }
    }
    return { ok: false, error: `Scene ${sceneNumber} failed.` };
  }, [id]);

  // Generate All: sequential per-scene, retry on failure, refresh between scenes,
  // and report any gaps after the loop completes.
  const generateAll = async () => {
    cancelRef.current = false;
    setGenerating(true);
    setGenError(null);
    const pending = scenes.filter((s) => s.panels.length === 0);
    const failures: string[] = [];

    for (let i = 0; i < pending.length; i++) {
      if (cancelRef.current) break;
      const scene = pending[i];
      setGenScene(scene.id);
      setGenProgress(`Generating scene ${i + 1} of ${pending.length} (Scene ${scene.scene_number})…`);

      const result = await generateSceneWithRetry(scene.id, scene.scene_number);
      if (!result.ok && result.error) failures.push(result.error);

      // Refresh data after each scene so the panel count + BOARDED badges update live.
      await fetchData();
    }

    // After loop: detect any pending scenes that still have zero panels (a real gap).
    const post = await fetch(`/api/projects/${id}/storyboard`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (post?.scenes) {
      const stillEmpty = post.scenes.filter((s: Scene) => pending.some((p) => p.id === s.id) && (s.panels?.length ?? 0) === 0);
      if (stillEmpty.length > 0) {
        const numbers = stillEmpty.map((s: Scene) => `Scene ${s.scene_number}`).join(", ");
        failures.push(`Did not finish: ${numbers}. Click "Generate Panels" on each to retry individually.`);
      }
    }

    if (cancelRef.current) failures.unshift("Generation cancelled by user.");
    if (failures.length > 0) setGenError(failures.join("  •  "));

    cancelRef.current = false;
    setGenerating(false);
    setGenScene(null);
    setGenProgress(null);
  };

  // Generate single scene (for individual buttons)
  const generatePanels = async (sceneId: string) => {
    setGenerating(true);
    setGenError(null);
    setGenScene(sceneId);
    try {
      const res = await fetch(`/api/projects/${id}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: sceneId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGenError(data.error || `Generation failed (${res.status}). Please try again.`);
      }
    } catch {
      setGenError("Network error. Please check your connection and try again.");
    }
    await fetchData();
    setGenerating(false);
    setGenScene(null);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading storyboard data...
      </div>
    );
  }

  const scenesWithPanels = scenes.filter((s) => s.panels.length > 0);
  const scenesWithoutPanels = scenes.filter((s) => s.panels.length === 0);
  const totalDuration = scenes.reduce(
    (acc, s) => acc + s.panels.reduce((a, p) => a + (p.duration_seconds || 0), 0),
    0
  );

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
              Storyboard
            </h1>
            <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
              {scenes.length} scenes &middot; {totalPanels} panels &middot;{" "}
              {Math.round(totalDuration)}s estimated runtime
            </p>
          </div>
          <div className="flex gap-3">
            {scenesWithoutPanels.length > 0 && (
              <button
                onClick={generateAll}
                disabled={generating}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {generating && genProgress
                  ? genProgress
                  : `Generate All (${scenesWithoutPanels.length} scenes)`}
              </button>
            )}
            {generating && (
              <button
                onClick={cancelGeneration}
                disabled={cancelRef.current}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                style={{ color: "rgb(248,113,113)", border: "1px solid rgba(239,68,68,0.4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {cancelRef.current ? "Cancelling…" : "Cancel"}
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

      {/* Character cast strip — voice-only chars excluded since they never appear on screen */}
      {characters.filter((c) => !c.voice_only).length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Cast Reference
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {characters.filter((c) => !c.voice_only).map((c) => (
              <div key={c.id} className="flex-shrink-0 text-center">
                <div
                  className="w-12 h-12 rounded-full overflow-hidden"
                  style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
                >
                  {headshots[c.id] ? (
                    <img
                      src={headshots[c.id]}
                      alt={c.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: "var(--brand-gray)" }}>
                      {c.name[0]}
                    </div>
                  )}
                </div>
                <p className="text-[9px] mt-1 max-w-[60px] truncate" style={{ color: "var(--brand-gray)" }}>
                  {c.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {scenes.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
        >
          <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No scenes found</p>
          <p className="text-xs" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
            Run extraction first to generate scene data
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {scenes.map((scene) => {
            const isExpanded = expandedScene === scene.id;
            const hasPanels = scene.panels.length > 0;
            const sceneDuration = scene.panels.reduce(
              (a, p) => a + (p.duration_seconds || 0),
              0
            );

            return (
              <div
                key={scene.id}
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
              >
                {/* Scene header */}
                <button
                  onClick={() => setExpandedScene(isExpanded ? null : scene.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between transition-colors"
                  style={{ background: isExpanded ? "rgba(255,138,42,0.04)" : "transparent" }}
                  onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.03)"; }}
                  onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm font-bold" style={{ color: "var(--brand-orange)" }}>
                      Scene {scene.scene_number}
                    </span>
                    <span className="text-xs truncate max-w-[300px]" style={{ color: "var(--brand-gray)" }}>
                      {scene.location}
                    </span>
                    {scene.time_of_day && (
                      <span className="text-[10px]" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                        {scene.time_of_day}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {hasPanels && (
                      <span className="text-[10px]" style={{ color: "var(--brand-gray)" }}>
                        {scene.panels.length} shots &middot; {Math.round(sceneDuration)}s
                      </span>
                    )}
                    <span
                      className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded`}
                      style={{
                        color: hasPanels ? "rgba(34,197,94,0.9)" : "var(--brand-gray)",
                        border: hasPanels ? "1px solid rgba(34,197,94,0.3)" : "1px solid var(--brand-steel)",
                        background: hasPanels ? "rgba(34,197,94,0.06)" : "transparent",
                      }}
                    >
                      {hasPanels ? "BOARDED" : "PENDING"}
                    </span>
                    <span className="text-xs" style={{ color: "var(--brand-gray)" }}>
                      {isExpanded ? "−" : "+"}
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-5 py-5" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                    {/* Scene summary */}
                    <div className="mb-4 flex items-start justify-between">
                      <div>
                        <p className="text-xs mb-1" style={{ color: "var(--brand-gray)" }}>
                          {scene.action_summary}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(scene.characters_present || []).map((name, i) => (
                            <span
                              key={i}
                              className="text-[9px] px-1.5 py-0.5"
                              style={{ color: "var(--brand-orange)", opacity: 0.7, border: "1px solid rgba(255,138,42,0.25)" }}
                            >
                              {name}
                            </span>
                          ))}
                          {scene.mood && (
                            <span
                              className="text-[9px] px-1.5 py-0.5"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                            >
                              {scene.mood}
                            </span>
                          )}
                        </div>
                      </div>
                      {!hasPanels && (
                        <button
                          onClick={() => generatePanels(scene.id)}
                          disabled={generating}
                          className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40 flex-shrink-0"
                          style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {generating && genScene === scene.id
                            ? "Generating..."
                            : "Generate Panels"}
                        </button>
                      )}
                    </div>

                    {/* Generating indicator */}
                    {!hasPanels && generating && genScene === scene.id && (
                      <div
                        className="rounded-xl p-8 text-center mt-4"
                        style={{ border: "1px solid rgba(255,138,42,0.25)", background: "rgba(255,138,42,0.05)" }}
                      >
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "0ms" }} />
                          <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "150ms" }} />
                          <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "300ms" }} />
                        </div>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-orange)" }}>Breaking scene into shots & generating panels</p>
                        <p className="text-xs" style={{ color: "var(--brand-gray)" }}>This may take 30–60 seconds per scene.</p>
                      </div>
                    )}

                    {/* Panel strip */}
                    {hasPanels && (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                        {scene.panels.map((panel) => (
                          <div
                            key={panel.id}
                            className="group rounded-lg overflow-hidden"
                            style={{ border: "1px solid var(--brand-steel)" }}
                          >
                            {/* Panel image */}
                            <div className="aspect-video relative overflow-hidden" style={{ background: "var(--brand-navy)" }}>
                              {panelImages[panel.id] ? (
                                <img
                                  src={panelImages[panel.id]}
                                  alt={`Scene ${scene.scene_number} Panel ${panel.panel_number}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : loadingImages.has(panel.id) ? (
                                <div className="w-full h-full animate-pulse" style={{ background: "linear-gradient(90deg, var(--brand-navy) 25%, var(--brand-steel) 50%, var(--brand-navy) 75%)", backgroundSize: "200% 100%" }} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--brand-steel)" }}>
                                  No image
                                </div>
                              )}

                              {/* Shot info overlay */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex gap-1 flex-wrap">
                                  <span className="text-[8px] bg-amber-900/60 text-amber-300 px-1 py-0.5 uppercase">
                                    {panel.shot_type}
                                  </span>
                                  <span className="text-[8px] bg-black/60 text-neutral-300 px-1 py-0.5">
                                    {panel.camera_angle}
                                  </span>
                                  {panel.camera_movement && panel.camera_movement !== "static" && (
                                    <span className="text-[8px] bg-blue-900/60 text-blue-300 px-1 py-0.5">
                                      {panel.camera_movement}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span className="absolute top-1 left-1 text-[9px] bg-black/60 text-neutral-400 px-1.5 py-0.5">
                                {panel.panel_number}
                              </span>
                              <span className="absolute top-1 right-1 text-[9px] bg-black/60 text-neutral-400 px-1.5 py-0.5">
                                {panel.duration_seconds}s
                              </span>
                            </div>

                            {/* Panel details */}
                            <div className="p-2" style={{ background: "var(--brand-mid)" }}>
                              <p className="text-[10px] line-clamp-2 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                                {panel.action_description}
                              </p>
                              {panel.dialogue && (
                                <p className="text-[10px] mt-1 italic line-clamp-1" style={{ color: "var(--brand-orange)", opacity: 0.7 }}>
                                  &ldquo;{panel.dialogue}&rdquo;
                                </p>
                              )}
                              {panel.characters_in_shot?.length > 0 && (
                                <div className="flex gap-0.5 mt-1 flex-wrap">
                                  {panel.characters_in_shot.map((name, i) => (
                                    <span key={i} className="text-[8px]" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                                      {name}{i < panel.characters_in_shot.length - 1 ? "," : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pipeline complete — full celebration view with per-scene stats */}
      {scenesWithPanels.length === scenes.length && scenes.length > 0 && (
        <div
          className="mt-12 rounded-2xl overflow-hidden"
          style={{
            border: "1px solid rgba(34,197,94,0.4)",
            background: "linear-gradient(180deg, rgba(34,197,94,0.06), rgba(11,28,45,0.6))",
          }}
        >
          {/* Hero */}
          <div className="px-8 py-10 text-center" style={{ borderBottom: "1px solid rgba(34,197,94,0.2)" }}>
            <p
              className="text-[10px] uppercase tracking-[0.4em] mb-3"
              style={{ color: "rgba(34,197,94,0.8)" }}
            >
              All 7 Phases Complete
            </p>
            <h2
              className="text-4xl font-bold tracking-tight mb-3"
              style={{ color: "var(--brand-white)" }}
            >
              Pipeline Complete
            </h2>
            <p className="text-sm max-w-xl mx-auto" style={{ color: "var(--brand-gray)" }}>
              Your script is now a fully-boarded production package. Every scene is broken into
              cinematic panels with consistent characters, locked locations, and approved cast.
            </p>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "rgba(34,197,94,0.15)" }}>
            <div className="px-6 py-5 text-center" style={{ background: "var(--brand-mid)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--brand-orange)" }}>{scenes.length}</p>
              <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>Scenes</p>
            </div>
            <div className="px-6 py-5 text-center" style={{ background: "var(--brand-mid)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--brand-orange)" }}>{totalPanels}</p>
              <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>Panels</p>
            </div>
            <div className="px-6 py-5 text-center" style={{ background: "var(--brand-mid)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--brand-orange)" }}>{characters.filter((c) => !c.voice_only).length}</p>
              <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>Cast</p>
            </div>
            <div className="px-6 py-5 text-center" style={{ background: "var(--brand-mid)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--brand-orange)" }}>{Math.round(totalDuration)}s</p>
              <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>Runtime</p>
            </div>
          </div>

          {/* Per-scene breakdown */}
          <div className="px-8 py-6" style={{ borderTop: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Scene Breakdown
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {scenes.map((s) => {
                const dur = s.panels.reduce((a, p) => a + (p.duration_seconds || 0), 0);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setExpandedScene(s.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="text-left px-3 py-2 rounded-md transition-colors"
                    style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-navy)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--brand-navy)")}
                  >
                    <p className="text-xs" style={{ color: "var(--brand-orange)" }}>
                      Scene {s.scene_number}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--brand-gray)" }}>
                      {s.location || "—"} &middot; {s.panels.length} panels &middot; {Math.round(dur)}s
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CTAs */}
          <div className="px-8 py-6 flex items-center justify-center gap-4 flex-wrap" style={{ borderTop: "1px solid rgba(34,197,94,0.2)" }}>
            <Link
              href={`/projects/${id}`}
              className="text-xs uppercase tracking-widest px-6 py-3 transition-colors"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              Back to Project Overview
            </Link>
            <Link
              href={`/projects/${id}/first-frames`}
              className="text-xs uppercase tracking-widest px-6 py-3 transition-colors text-green-400 border border-green-800/50 hover:bg-green-950/30"
            >
              Continue to First Frames &rarr;
            </Link>
            <button
              onClick={() => window.print()}
              className="text-xs uppercase tracking-widest px-6 py-3 transition-colors"
              style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(76,201,240,0.08)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              Print / Export PDF
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
    </>
  );
}
