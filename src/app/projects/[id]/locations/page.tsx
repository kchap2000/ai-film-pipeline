"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface LocationVariation {
  id: string;
  location_id: string;
  image_url: string;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  variation_number: number;
}

interface LocationScene {
  id: string;
  scene_number: number;
  action_summary: string;
  time_of_day: string;
  mood: string;
  characters_present: string[];
}

interface Location {
  id: string;
  name: string;
  description: string;
  time_of_day: string;
  mood: string;
  locked: boolean;
  approved_image_url: string | null;
  variations: LocationVariation[];
  scenes: LocationScene[];
}

export default function LocationBiblePage() {
  const { id } = useParams<{ id: string }>();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/locations`);
    if (res.ok) {
      const data = await res.json();
      setLocations(data.locations || []);
      if (!selectedLoc && data.locations?.length > 0) {
        setSelectedLoc(data.locations[0].id);
      }
    }
    setLoading(false);
  }, [id, selectedLoc]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateVariations = async (locationId?: string) => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/projects/${id}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locationId ? { location_id: locationId } : {}),
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
  };

  const updateVariation = async (
    variationId: string,
    locationId: string,
    status: "approved" | "rejected",
    rejectionNote?: string
  ) => {
    await fetch(`/api/projects/${id}/locations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variation_id: variationId,
        location_id: locationId,
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
    await fetch(`/api/projects/${id}/locations`, {
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
        Loading location data...
      </div>
    );
  }

  const activeLoc = locations.find((l) => l.id === selectedLoc);
  const hasVariations = locations.some((l) => l.variations.length > 0);
  const allApproved = locations.every((l) => l.approved_image_url !== null);
  const allLocked = locations.every((l) => l.locked);

  return (
    <>
    <ProjectNav projectId={id} />
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
    <div className="max-w-6xl mx-auto px-6 py-12">
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
              Location & Scene Bible
            </h1>
            <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
              {locations.length} locations &middot; 5 variations each
            </p>
          </div>
          <div className="flex gap-3">
            {(!hasVariations || locations.length === 0) && (
              <button
                onClick={() => generateVariations()}
                disabled={generating}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {generating
                  ? locations.length === 0 ? "Extracting & Generating..." : "Generating..."
                  : locations.length === 0 ? "Extract Locations & Generate" : "Generate All Variations"}
              </button>
            )}
            {allApproved && !allLocked && (
              <button
                onClick={lockAll}
                disabled={locking}
                className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-5 py-2.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
              >
                {locking ? "Locking..." : "Lock All Locations"}
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

      {/* Generating skeleton when locations.length === 0 */}
      {generating && locations.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ border: "1px solid rgba(255,138,42,0.25)", background: "rgba(255,138,42,0.05)" }}
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "300ms" }} />
          </div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-orange)" }}>Extracting locations & generating images</p>
          <p className="text-xs" style={{ color: "var(--brand-gray)" }}>This takes 60–90 seconds. Images will appear when complete.</p>
        </div>
      ) : locations.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
        >
          <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No locations extracted yet</p>
          <p className="text-xs" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
            Click &quot;Extract Locations & Generate&quot; to pull unique locations from your scenes
          </p>
        </div>
      ) : (
        <div className="flex gap-8">
          {/* Location Sidebar */}
          <nav className="w-56 flex-shrink-0 space-y-1">
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Locations
            </p>
            {locations.map((loc) => {
              const isSelected = selectedLoc === loc.id;
              return (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLoc(loc.id)}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors"
                  style={{
                    border: isSelected ? "1px solid var(--brand-orange)" : "1px solid var(--brand-steel)",
                    background: isSelected ? "rgba(255,138,42,0.08)" : "var(--brand-mid)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate" style={{ color: isSelected ? "var(--brand-orange)" : "var(--brand-white)" }}>
                      {loc.name}
                    </span>
                    {loc.locked ? (
                      <span className="text-green-500 text-[10px] ml-2 flex-shrink-0">LOCKED</span>
                    ) : loc.approved_image_url ? (
                      <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: "var(--brand-orange)" }}>APPROVED</span>
                    ) : loc.variations.length > 0 ? (
                      <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: "var(--brand-gray)" }}>REVIEW</span>
                    ) : null}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {loc.time_of_day && (
                      <span className="text-[9px]" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>{loc.time_of_day}</span>
                    )}
                    {loc.mood && (
                      <span className="text-[9px]" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>&middot; {loc.mood}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Main Content */}
          <div className="flex-1">
            {activeLoc ? (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl" style={{ color: "var(--brand-white)" }}>{activeLoc.name}</h2>
                    <div className="flex gap-3 mt-1">
                      {activeLoc.time_of_day && (
                        <span
                          className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                          style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                        >
                          {activeLoc.time_of_day}
                        </span>
                      )}
                      {activeLoc.mood && (
                        <span
                          className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                          style={{ color: "var(--brand-orange)", opacity: 0.7, border: "1px solid rgba(255,138,42,0.25)" }}
                        >
                          {activeLoc.mood}
                        </span>
                      )}
                    </div>
                  </div>
                  {activeLoc.variations.length === 0 && (
                    <button
                      onClick={() => generateVariations(activeLoc.id)}
                      disabled={generating}
                      className="text-xs uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
                      style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {generating ? "Generating..." : "Generate"}
                    </button>
                  )}
                </div>

                {/* Variation Grid */}
                {activeLoc.variations.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                    {activeLoc.variations.map((v) => (
                      <div
                        key={v.id}
                        className="rounded-lg overflow-hidden transition-colors"
                        style={{
                          border: v.status === "approved"
                            ? "1px solid rgba(34,197,94,0.5)"
                            : v.status === "rejected"
                            ? "1px solid rgba(239,68,68,0.2)"
                            : "1px solid var(--brand-steel)",
                          background: v.status === "approved" ? "rgba(34,197,94,0.05)" : "var(--brand-mid)",
                          opacity: v.status === "rejected" ? 0.4 : 1,
                        }}
                      >
                        <div className="aspect-[4/3] relative" style={{ background: "var(--brand-navy)" }}>
                          <img
                            src={v.image_url}
                            alt={`${activeLoc.name} variation ${v.variation_number}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-1 left-1 text-[9px] bg-black/60 text-neutral-400 px-1.5 py-0.5">
                            #{v.variation_number}
                          </span>
                          {v.status === "approved" && (
                            <span className="absolute top-1 right-1 text-[9px] bg-green-900/80 text-green-300 px-1.5 py-0.5 uppercase">
                              Approved
                            </span>
                          )}
                        </div>

                        {v.status === "pending" && (
                          <div className="flex" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                            <button
                              onClick={() => updateVariation(v.id, activeLoc.id, "approved")}
                              className="flex-1 py-2 text-[10px] uppercase tracking-widest text-green-500 hover:bg-green-950/20 transition-colors"
                            >
                              Approve
                            </button>
                            <div style={{ width: "1px", background: "var(--brand-steel)" }} />
                            <button
                              onClick={() => setRejectingId(v.id)}
                              className="flex-1 py-2 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-950/20 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {rejectingId === v.id && (
                          <div className="p-2" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                            <input
                              type="text"
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              placeholder="Note (optional)"
                              className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                              style={{
                                background: "transparent",
                                border: "1px solid var(--brand-steel)",
                                color: "var(--brand-white)",
                              }}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateVariation(v.id, activeLoc.id, "rejected", rejectNote)}
                                className="flex-1 py-1 text-[10px] uppercase text-red-500 border border-red-900/50 hover:bg-red-950/20"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => { setRejectingId(null); setRejectNote(""); }}
                                className="flex-1 py-1 text-[10px] uppercase transition-colors"
                                style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : generating ? (
                  <div
                    className="rounded-xl p-10 text-center mb-8"
                    style={{ border: "1px solid rgba(255,138,42,0.25)", background: "rgba(255,138,42,0.05)" }}
                  >
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--brand-orange)", animationDelay: "300ms" }} />
                    </div>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-orange)" }}>Generating location images</p>
                    <p className="text-xs" style={{ color: "var(--brand-gray)" }}>This takes 60–90 seconds. Images will appear when complete.</p>
                  </div>
                ) : (
                  <div
                    className="rounded-xl p-12 text-center mb-8"
                    style={{ border: "2px dashed var(--brand-steel)" }}
                  >
                    <p className="text-sm" style={{ color: "var(--brand-gray)" }}>No variations generated yet</p>
                  </div>
                )}

                {/* Scenes at this location */}
                {activeLoc.scenes.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                      Scenes at this Location ({activeLoc.scenes.length})
                    </h3>
                    <div className="space-y-1">
                      {activeLoc.scenes.map((scene) => (
                        <div
                          key={scene.id}
                          className="rounded-lg p-4"
                          style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
                        >
                          <div className="flex items-baseline gap-3 mb-1">
                            <span className="text-xs font-bold" style={{ color: "var(--brand-orange)" }}>
                              Scene {scene.scene_number}
                            </span>
                            {scene.time_of_day && (
                              <span className="text-[10px]" style={{ color: "var(--brand-gray)" }}>{scene.time_of_day}</span>
                            )}
                            {scene.mood && (
                              <span className="text-[10px]" style={{ color: "var(--brand-orange)", opacity: 0.6 }}>{scene.mood}</span>
                            )}
                          </div>
                          <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                            {scene.action_summary}
                          </p>
                          {scene.characters_present?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {scene.characters_present.map((name, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] px-1.5 py-0.5"
                                  style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                Select a location to view variations and scenes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Phase complete */}
      {allLocked && locations.length > 0 && (
        <div className="mt-10 pt-8 flex items-center justify-between" style={{ borderTop: "1px solid var(--brand-steel)" }}>
          <div>
            <p className="text-sm text-green-400">All locations locked into Scene Bible</p>
            <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
              Location references are now canonical for storyboard generation.
            </p>
          </div>
          <Link
            href={`/projects/${id}`}
            className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
            style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            Continue &rarr;
          </Link>
        </div>
      )}
    </div>
    </div>
    </>
  );
}
