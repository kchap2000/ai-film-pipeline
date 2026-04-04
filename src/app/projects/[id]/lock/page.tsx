"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface LockCharacter {
  id: string;
  name: string;
  description: string;
  role: string;
  locked: boolean;
  approved_cast_id: string | null;
  approved_image_url: string | null;
  pose_sheet_url: string | null;
}

export default function CharacterLockPage() {
  const { id } = useParams<{ id: string }>();
  const [characters, setCharacters] = useState<LockCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState<string | "all" | null>(null);
  const [generatingPoseSheet, setGeneratingPoseSheet] = useState<Set<string>>(new Set());
  const [poseSheetError, setPoseSheetError] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/lock`);
    if (res.ok) {
      const data = await res.json();
      setCharacters(data.characters || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-generate pose sheet for characters with headshot but no pose sheet
  useEffect(() => {
    if (characters.length === 0) return;
    const needs = characters.filter(
      (c) => c.approved_image_url && !c.pose_sheet_url && !generatingPoseSheet.has(c.id)
    );
    for (const char of needs) {
      triggerPoseSheet(char.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters.map((c) => c.id + (c.approved_image_url ? "1" : "0") + (c.pose_sheet_url ? "1" : "0")).join()]);

  const triggerPoseSheet = async (characterId: string) => {
    setGeneratingPoseSheet((prev) => new Set(prev).add(characterId));
    setPoseSheetError((prev) => { const n = { ...prev }; delete n[characterId]; return n; });

    try {
      const res = await fetch(`/api/projects/${id}/posesheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pose sheet generation failed");

      // Update local state
      setCharacters((prev) =>
        prev.map((c) => (c.id === characterId ? { ...c, pose_sheet_url: data.pose_sheet_url } : c))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setPoseSheetError((prev) => ({ ...prev, [characterId]: msg }));
    } finally {
      setGeneratingPoseSheet((prev) => {
        const n = new Set(prev);
        n.delete(characterId);
        return n;
      });
    }
  };

  const lockCharacter = async (characterId: string) => {
    setLocking(characterId);
    await fetch(`/api/projects/${id}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character_id: characterId }),
    });
    await fetchData();
    setLocking(null);
  };

  const lockAll = async () => {
    setLocking("all");
    await fetch(`/api/projects/${id}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock_all: true }),
    });
    await fetchData();
    setLocking(null);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading characters...
      </div>
    );
  }

  const castCharacters = characters.filter((c) => c.approved_cast_id !== null);
  const allLocked = castCharacters.length > 0 && castCharacters.every((c) => c.locked);
  const noCast = castCharacters.length === 0;

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
                <h1
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: "var(--brand-white)" }}
                >
                  Character Lock
                </h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  {castCharacters.length} cast{" "}
                  {castCharacters.length === 1 ? "character" : "characters"} &middot; approve
                  headshot &amp; reference sheet to lock
                </p>
              </div>
              {!allLocked && !noCast && (
                <button
                  onClick={lockAll}
                  disabled={locking === "all"}
                  className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-5 py-2.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                >
                  {locking === "all" ? "Locking..." : "Lock All"}
                </button>
              )}
            </div>
          </header>

          {noCast ? (
            <div
              className="rounded-xl p-12 text-center"
              style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
            >
              <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>
                No characters have been cast yet
              </p>
              <Link
                href={`/projects/${id}/cast`}
                className="text-xs transition-colors"
                style={{ color: "var(--brand-orange)" }}
              >
                &rarr; Go to AI Casting
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {castCharacters.map((char) => {
                const isGenerating = generatingPoseSheet.has(char.id);
                const error = poseSheetError[char.id];

                return (
                  <div
                    key={char.id}
                    className="rounded-xl overflow-hidden transition-colors"
                    style={{
                      border: char.locked
                        ? "1px solid rgba(34,197,94,0.4)"
                        : "1px solid var(--brand-steel)",
                      background: char.locked ? "rgba(34,197,94,0.04)" : "var(--brand-mid)",
                    }}
                  >
                    {/* Card Header */}
                    <div
                      className="flex items-center justify-between px-6 py-4"
                      style={{ borderBottom: "1px solid var(--brand-steel)" }}
                    >
                      <div className="flex items-center gap-3">
                        <h2 className="text-base font-semibold" style={{ color: "var(--brand-white)" }}>
                          {char.name}
                        </h2>
                        <span
                          className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                          style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                        >
                          {char.role}
                        </span>
                        {char.locked && (
                          <span className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-2 py-0.5 bg-green-950/30">
                            Locked
                          </span>
                        )}
                      </div>

                      {!char.locked && (
                        <button
                          onClick={() => lockCharacter(char.id)}
                          disabled={locking === char.id}
                          className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-4 py-2 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                        >
                          {locking === char.id ? "Locking..." : "Lock Character"}
                        </button>
                      )}
                    </div>

                    {/* Headshot + Reference Sheet */}
                    <div className="grid grid-cols-[200px_1fr] gap-0">
                      {/* Approved Headshot — fixed-width column */}
                      <div style={{ borderRight: "1px solid var(--brand-steel)" }}>
                        <div className="aspect-[3/4] relative" style={{ background: "var(--brand-navy)" }}>
                          {char.approved_image_url ? (
                            <img
                              src={char.approved_image_url}
                              alt={`${char.name} approved cast`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-xs"
                              style={{ color: "var(--brand-steel)" }}
                            >
                              No image
                            </div>
                          )}
                        </div>
                        <div
                          className="py-2 text-center text-[10px] uppercase tracking-widest"
                          style={{
                            borderTop: "1px solid var(--brand-steel)",
                            color: "var(--brand-orange)",
                          }}
                        >
                          Approved Cast
                        </div>
                      </div>

                      {/* Character Reference Sheet — fills remaining width */}
                      <div className="flex flex-col">
                        {char.pose_sheet_url ? (
                          <>
                            <div className="flex-1 relative" style={{ background: "var(--brand-navy)" }}>
                              <img
                                src={char.pose_sheet_url}
                                alt={`${char.name} character reference sheet`}
                                className="w-full h-full object-contain"
                                style={{ maxHeight: "400px" }}
                              />
                            </div>
                            <div
                              className="flex items-center justify-between px-4 py-2"
                              style={{ borderTop: "1px solid var(--brand-steel)" }}
                            >
                              <span
                                className="text-[10px] uppercase tracking-widest"
                                style={{ color: "var(--brand-gray)" }}
                              >
                                Character Reference Sheet
                              </span>
                              <button
                                onClick={() => triggerPoseSheet(char.id)}
                                disabled={isGenerating}
                                className="text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
                                style={{ color: "var(--brand-orange)" }}
                              >
                                {isGenerating ? "Regenerating..." : "Regenerate"}
                              </button>
                            </div>
                          </>
                        ) : isGenerating ? (
                          <div
                            className="flex-1 flex flex-col items-center justify-center gap-3"
                            style={{ minHeight: "200px" }}
                          >
                            <div
                              className="w-6 h-6 rounded-full border-2 animate-spin"
                              style={{
                                borderColor: "var(--brand-steel)",
                                borderTopColor: "var(--brand-orange)",
                              }}
                            />
                            <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                              Generating character reference sheet…
                            </p>
                          </div>
                        ) : error ? (
                          <div
                            className="flex-1 flex flex-col items-center justify-center gap-3 px-6"
                            style={{ minHeight: "200px" }}
                          >
                            <p className="text-xs text-center text-red-400">{error}</p>
                            <button
                              onClick={() => triggerPoseSheet(char.id)}
                              className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
                              style={{
                                color: "var(--brand-orange)",
                                border: "1px solid rgba(255,138,42,0.4)",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "rgba(255,138,42,0.08)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "transparent")
                              }
                            >
                              Retry
                            </button>
                          </div>
                        ) : (
                          <div
                            className="flex-1 flex flex-col items-center justify-center gap-2"
                            style={{ minHeight: "200px" }}
                          >
                            <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                              No reference sheet yet
                            </p>
                            <button
                              onClick={() => triggerPoseSheet(char.id)}
                              className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
                              style={{
                                color: "var(--brand-orange)",
                                border: "1px solid rgba(255,138,42,0.4)",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "rgba(255,138,42,0.08)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "transparent")
                              }
                            >
                              Generate Reference Sheet
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Phase complete footer */}
          {allLocked && castCharacters.length > 0 && (
            <div
              className="mt-10 pt-8 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--brand-steel)" }}
            >
              <div>
                <p className="text-sm text-green-400">All characters locked</p>
                <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                  Character identities are now canonical for all downstream generation.
                </p>
              </div>
              <Link
                href={`/projects/${id}/locations`}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "transparent")
                }
              >
                Continue to Location Scouting &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
