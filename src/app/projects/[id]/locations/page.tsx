"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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
      <div className="max-w-6xl mx-auto px-6 py-12 text-neutral-500 text-sm animate-pulse">
        Loading location data...
      </div>
    );
  }

  const activeLoc = locations.find((l) => l.id === selectedLoc);
  const hasVariations = locations.some((l) => l.variations.length > 0);
  const allApproved = locations.every((l) => l.approved_image_url !== null);
  const allLocked = locations.every((l) => l.locked);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="border-b border-amber-900/25 pb-8 mb-8">
        <Link
          href={`/projects/${id}`}
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; Back to Project
        </Link>
        <div className="flex items-end justify-between mt-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
              Location & Scene Bible
            </h1>
            <p className="text-xs text-neutral-500 mt-2">
              {locations.length} locations &middot; 5 variations each
            </p>
          </div>
          <div className="flex gap-3">
            {!hasVariations && locations.length === 0 && (
              <button
                onClick={() => generateVariations()}
                disabled={generating}
                className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
              >
                {generating
                  ? "Extracting & Generating..."
                  : "Extract Locations & Generate"}
              </button>
            )}
            {locations.length > 0 && !hasVariations && (
              <button
                onClick={() => generateVariations()}
                disabled={generating}
                className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
              >
                {generating ? "Generating..." : "Generate All Variations"}
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
        <div className="border border-red-900/50 bg-red-950/20 p-4 mb-6 flex items-center justify-between">
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
        <div className="border border-amber-900/30 bg-amber-950/10 p-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="text-amber-400 text-xs uppercase tracking-widest mb-1">Extracting locations & generating images</p>
          <p className="text-neutral-600 text-xs">This takes 60–90 seconds. Images will appear when complete.</p>
        </div>
      ) : locations.length === 0 ? (
        <div className="border border-neutral-800 p-12 text-center">
          <p className="text-neutral-500 text-sm mb-2">
            No locations extracted yet
          </p>
          <p className="text-neutral-600 text-xs">
            Click &quot;Extract Locations & Generate&quot; to pull unique
            locations from your scenes
          </p>
        </div>
      ) : (
        <div className="flex gap-8">
          {/* Location Sidebar */}
          <nav className="w-56 flex-shrink-0 space-y-px">
            <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-3">
              Locations
            </p>
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLoc(loc.id)}
                className={`w-full text-left px-4 py-3 border transition-colors ${
                  selectedLoc === loc.id
                    ? "border-amber-700 bg-amber-950/20"
                    : "border-neutral-800 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm truncate ${
                      selectedLoc === loc.id
                        ? "text-amber-400"
                        : "text-neutral-300"
                    }`}
                  >
                    {loc.name}
                  </span>
                  {loc.locked ? (
                    <span className="text-green-500 text-[10px] ml-2 flex-shrink-0">
                      LOCKED
                    </span>
                  ) : loc.approved_image_url ? (
                    <span className="text-amber-600 text-[10px] ml-2 flex-shrink-0">
                      APPROVED
                    </span>
                  ) : loc.variations.length > 0 ? (
                    <span className="text-neutral-500 text-[10px] ml-2 flex-shrink-0">
                      REVIEW
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2 mt-1">
                  {loc.time_of_day && (
                    <span className="text-[9px] text-neutral-600">
                      {loc.time_of_day}
                    </span>
                  )}
                  {loc.mood && (
                    <span className="text-[9px] text-neutral-600">
                      &middot; {loc.mood}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </nav>

          {/* Main Content */}
          <div className="flex-1">
            {activeLoc ? (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-neutral-100">
                      {activeLoc.name}
                    </h2>
                    <div className="flex gap-3 mt-1">
                      {activeLoc.time_of_day && (
                        <span className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-2 py-0.5">
                          {activeLoc.time_of_day}
                        </span>
                      )}
                      {activeLoc.mood && (
                        <span className="text-[10px] uppercase tracking-widest text-amber-600/70 border border-amber-900/30 px-2 py-0.5">
                          {activeLoc.mood}
                        </span>
                      )}
                    </div>
                  </div>
                  {activeLoc.variations.length === 0 && (
                    <button
                      onClick={() => generateVariations(activeLoc.id)}
                      disabled={generating}
                      className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-4 py-2 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
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
                        className={`border transition-colors ${
                          v.status === "approved"
                            ? "border-green-700 bg-green-950/10"
                            : v.status === "rejected"
                            ? "border-red-900/50 opacity-40"
                            : "border-neutral-800 hover:border-neutral-600"
                        }`}
                      >
                        <div className="aspect-[4/3] bg-neutral-900 relative">
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
                          <div className="flex divide-x divide-neutral-800">
                            <button
                              onClick={() =>
                                updateVariation(
                                  v.id,
                                  activeLoc.id,
                                  "approved"
                                )
                              }
                              className="flex-1 py-2 text-[10px] uppercase tracking-widest text-green-500 hover:bg-green-950/20 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingId(v.id)}
                              className="flex-1 py-2 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-950/20 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {rejectingId === v.id && (
                          <div className="p-2 border-t border-neutral-800">
                            <input
                              type="text"
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              placeholder="Note (optional)"
                              className="w-full bg-transparent border border-neutral-700 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:border-red-800 mb-2"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() =>
                                  updateVariation(
                                    v.id,
                                    activeLoc.id,
                                    "rejected",
                                    rejectNote
                                  )
                                }
                                className="flex-1 py-1 text-[10px] uppercase text-red-500 border border-red-900/50 hover:bg-red-950/20"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingId(null);
                                  setRejectNote("");
                                }}
                                className="flex-1 py-1 text-[10px] uppercase text-neutral-500 border border-neutral-700 hover:bg-neutral-800"
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
                  <div className="border border-amber-900/30 bg-amber-950/10 p-10 text-center mb-8">
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <p className="text-amber-400 text-xs uppercase tracking-widest mb-1">Generating location images</p>
                    <p className="text-neutral-600 text-xs">This takes 60–90 seconds. Images will appear when complete.</p>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-neutral-700 p-12 text-center mb-8">
                    <p className="text-neutral-500 text-sm">
                      No variations generated yet
                    </p>
                  </div>
                )}

                {/* Scenes at this location */}
                {activeLoc.scenes.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
                      Scenes at this Location ({activeLoc.scenes.length})
                    </h3>
                    <div className="space-y-px">
                      {activeLoc.scenes.map((scene) => (
                        <div
                          key={scene.id}
                          className="border border-neutral-800 p-4"
                        >
                          <div className="flex items-baseline gap-3 mb-1">
                            <span className="text-amber-600 text-xs font-bold">
                              Scene {scene.scene_number}
                            </span>
                            {scene.time_of_day && (
                              <span className="text-[10px] text-neutral-500">
                                {scene.time_of_day}
                              </span>
                            )}
                            {scene.mood && (
                              <span className="text-[10px] text-amber-700">
                                {scene.mood}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400">
                            {scene.action_summary}
                          </p>
                          {scene.characters_present?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {scene.characters_present.map((name, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] text-neutral-500 border border-neutral-700 px-1.5 py-0.5"
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
              <p className="text-neutral-500 text-sm">
                Select a location to view variations and scenes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Phase complete */}
      {allLocked && locations.length > 0 && (
        <div className="mt-10 border-t border-amber-900/25 pt-8 flex items-center justify-between">
          <div>
            <p className="text-green-400 text-sm">
              All locations locked into Scene Bible
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              Location references are now canonical for storyboard generation.
            </p>
          </div>
          <Link
            href={`/projects/${id}`}
            className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors"
          >
            Continue &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
