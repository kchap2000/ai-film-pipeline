"use client";

import { useEffect, useState, useCallback } from "react";
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
  approved_variation_url: string | null;
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

  // Generate All: sequential per-scene, skip scenes with panels
  const generateAll = async () => {
    setGenerating(true);
    setGenError(null);
    const pending = scenes.filter((s) => s.panels.length === 0);
    for (let i = 0; i < pending.length; i++) {
      const scene = pending[i];
      setGenScene(scene.id);
      setGenProgress(`Generating scene ${i + 1} of ${pending.length} (Scene ${scene.scene_number})…`);
      try {
        const res = await fetch(`/api/projects/${id}/storyboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene_id: scene.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setGenError(data.error || `Scene ${scene.scene_number} failed (${res.status}).`);
        }
      } catch {
        setGenError(`Network error on scene ${scene.scene_number}.`);
      }
    }
    await fetchData();
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

      {/* Character cast strip */}
      {characters.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Cast Reference
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {characters.map((c) => (
              <div key={c.id} className="flex-shrink-0 text-center">
                <div
                  className="w-12 h-12 rounded-full overflow-hidden"
                  style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
                >
                  {c.approved_variation_url ? (
                    <img
                      src={c.approved_variation_url}
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

      {/* Pipeline complete */}
      {scenesWithPanels.length === scenes.length && scenes.length > 0 && (
        <div className="mt-10 pt-8 text-center" style={{ borderTop: "1px solid var(--brand-steel)" }}>
          <p className="text-green-400 text-lg mb-2">Storyboard Complete</p>
          <p className="text-xs max-w-md mx-auto" style={{ color: "var(--brand-gray)" }}>
            All {scenes.length} scenes have been broken into {totalPanels} shot panels with an estimated runtime of{" "}
            {Math.round(totalDuration)} seconds.
          </p>
          <Link
            href={`/projects/${id}`}
            className="inline-block mt-6 text-xs uppercase tracking-widest px-6 py-3 transition-colors"
            style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            Back to Project Overview
          </Link>
        </div>
      )}
    </div>
    </div>
    </>
  );
}
