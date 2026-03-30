"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface CastVariation {
  id: string;
  character_id: string;
  image_url: string;
  prompt_used: string;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  variation_number: number;
}

interface CastCharacter {
  id: string;
  name: string;
  description: string;
  role: string;
  voice_only: boolean;
  approved_cast_id: string | null;
  variations: CastVariation[];
}

const ROLE_COLORS: Record<string, string> = {
  lead: "border-amber-700 text-amber-400 bg-amber-950/30",
  supporting: "border-blue-800/50 text-blue-400 bg-blue-950/30",
  minor: "border-neutral-700 text-neutral-400",
  extra: "border-neutral-800 text-neutral-500",
  mentioned: "border-neutral-800 text-neutral-600",
};

const TOTAL_VARIATIONS = 10;

export default function CastingPage() {
  const { id } = useParams<{ id: string }>();
  const [characters, setCharacters] = useState<CastCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; charName: string } | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [genErrors, setGenErrors] = useState<string[]>([]);

  const fetchCast = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/cast`);
    if (res.ok) {
      const data = await res.json();
      setCharacters(data.characters || []);
      if (!selectedChar && data.characters?.length > 0) {
        setSelectedChar(data.characters[0].id);
      }
    }
    setLoading(false);
  }, [id, selectedChar]);

  useEffect(() => {
    fetchCast();
  }, [fetchCast]);

  // Generate all missing variations for a character, one image at a time.
  // Each POST call generates exactly 1 image — Vercel Hobby compatible (≤60s/call).
  const generateVariations = async (characterId?: string) => {
    setGenerating(true);
    setGenErrors([]);
    const errors: string[] = [];

    // Get latest character data to know how many variations already exist
    const res = await fetch(`/api/projects/${id}/cast`);
    const data = await res.json();
    const chars: CastCharacter[] = data.characters || [];

    const targetChars = characterId
      ? chars.filter((c) => c.id === characterId && !c.voice_only)
      : chars.filter((c) => !c.voice_only);

    for (const char of targetChars) {
      const existingNums = new Set(char.variations.map((v) => v.variation_number));
      const needed = Array.from({ length: TOTAL_VARIATIONS }, (_, i) => i + 1).filter(
        (n) => !existingNums.has(n)
      );

      if (needed.length === 0) continue;

      for (let idx = 0; idx < needed.length; idx++) {
        const variationNum = needed[idx];
        setGenProgress({
          current: idx + 1,
          total: needed.length,
          charName: char.name,
        });

        try {
          const postRes = await fetch(`/api/projects/${id}/cast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              character_id: char.id,
              variation_number: variationNum,
            }),
          });
          const postData = await postRes.json();

          if (!postRes.ok) {
            errors.push(`${char.name} #${variationNum}: ${postData.error || `Error ${postRes.status}`}`);
          }
        } catch (err) {
          errors.push(`${char.name} #${variationNum}: ${err instanceof Error ? err.message : "Network error"}`);
        }

        // Refresh the grid after each image so it appears immediately
        await fetchCast();
      }
    }

    if (errors.length > 0) setGenErrors(errors);
    setGenProgress(null);
    setGenerating(false);
  };

  const updateVariation = async (
    variationId: string,
    characterId: string,
    status: "approved" | "rejected",
    rejectionNote?: string
  ) => {
    await fetch(`/api/projects/${id}/cast`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variation_id: variationId,
        character_id: characterId,
        status,
        rejection_note: rejectionNote || null,
      }),
    });
    setRejectingId(null);
    setRejectNote("");
    await fetchCast();
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 text-neutral-500 text-sm animate-pulse">
        Loading casting data...
      </div>
    );
  }

  const activeChar = characters.find((c) => c.id === selectedChar);
  // Exclude voice-only from counts and generation (they're never on screen)
  const castableChars = characters.filter((c) => !c.voice_only);
  const hasVariations = castableChars.some((c) => c.variations.length > 0);
  const allCast = castableChars.length > 0 && castableChars.every((c) => c.approved_cast_id !== null && c.variations.length > 0);

  if (characters.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Link
          href={`/projects/${id}`}
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; Back to Project
        </Link>
        <div className="border border-neutral-800 p-10 mt-8 text-center">
          <p className="text-neutral-400 text-sm mb-2">No characters found</p>
          <p className="text-neutral-600 text-xs mb-6">
            Characters are populated by running LLM Extraction on your uploaded script.
            Extract first, then come back to cast.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href={`/projects/${id}`}
              className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors"
            >
              Go to Project &rarr; Run Extraction
            </Link>
            <Link
              href={`/projects/${id}/bible`}
              className="text-xs uppercase tracking-widest text-neutral-400 border border-neutral-700 px-5 py-2.5 hover:bg-neutral-800/30 transition-colors"
            >
              View Film Bible
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <ProjectNav projectId={id} />
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
              AI Casting
            </h1>
            <p className="text-xs text-neutral-500 mt-2">
              {castableChars.length} castable characters &middot; {TOTAL_VARIATIONS} variations each
              {characters.length > castableChars.length && (
                <span className="text-neutral-600">
                  {" "}&middot; {characters.length - castableChars.length} voice-only
                </span>
              )}
            </p>
          </div>
          {!hasVariations && (
            <button
              onClick={() => generateVariations()}
              disabled={generating}
              className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
            >
              {generating ? "Generating..." : "Generate All Variations"}
            </button>
          )}
        </div>
      </header>

      {/* Generation progress bar */}
      {genProgress && (
        <div className="border border-amber-900/40 bg-amber-950/10 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-amber-400 text-xs uppercase tracking-widest">
              Generating {genProgress.charName} — {genProgress.current} / {genProgress.total}
            </p>
            <p className="text-neutral-600 text-xs">Images appear as they complete</p>
          </div>
          <div className="w-full bg-neutral-800 h-1">
            <div
              className="bg-amber-600 h-1 transition-all duration-300"
              style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Generation errors */}
      {genErrors.length > 0 && (
        <div className="border border-red-900/50 bg-red-950/20 p-4 mb-6">
          <p className="text-red-400 text-xs font-bold mb-2 uppercase tracking-widest">
            Generation Errors
          </p>
          {genErrors.slice(0, 5).map((err, i) => (
            <p key={i} className="text-red-400/80 text-xs">{err}</p>
          ))}
          {genErrors.length > 5 && (
            <p className="text-red-400/60 text-xs mt-1">
              ...and {genErrors.length - 5} more
            </p>
          )}
        </div>
      )}

      <div className="flex gap-8">
        {/* Character Sidebar */}
        <nav className="w-56 flex-shrink-0 space-y-px">
          <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-3">
            Characters
          </p>
          {characters.map((char) => {
            const charHasVariations = char.variations.length > 0;
            const approved = char.approved_cast_id !== null && charHasVariations;
            const hasPending = charHasVariations && char.variations.some((v) => v.status === "pending");
            return (
              <button
                key={char.id}
                onClick={() => setSelectedChar(char.id)}
                className={`w-full text-left px-4 py-3 border transition-colors ${
                  selectedChar === char.id
                    ? "border-amber-700 bg-amber-950/20"
                    : char.voice_only
                    ? "border-neutral-800/50 opacity-60 hover:opacity-80"
                    : "border-neutral-800 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      selectedChar === char.id ? "text-amber-400" : "text-neutral-300"
                    }`}
                  >
                    {char.name}
                  </span>
                  {char.voice_only ? (
                    <span className="text-purple-400 text-[9px] uppercase tracking-widest">V.O.</span>
                  ) : approved ? (
                    <span className="text-green-500 text-[10px]">CAST</span>
                  ) : hasPending ? (
                    <span className="text-amber-600 text-[10px]">REVIEW</span>
                  ) : null}
                </div>
                <span
                  className={`text-[10px] uppercase tracking-widest ${
                    ROLE_COLORS[char.role]?.split(" ").find((c) => c.startsWith("text-")) ||
                    "text-neutral-500"
                  }`}
                >
                  {char.role}
                </span>
              </button>
            );
          })}

          {allCast && characters.length > 0 && (
            <div className="mt-6 pt-4 border-t border-neutral-800">
              <p className="text-green-500 text-[10px] uppercase tracking-widest mb-2">
                All characters cast
              </p>
              <Link
                href={`/projects/${id}`}
                className="text-xs text-amber-500 hover:text-amber-400"
              >
                &rarr; Continue to next phase
              </Link>
            </div>
          )}
        </nav>

        {/* Variation Grid */}
        <div className="flex-1">
          {activeChar ? (
            <>
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl text-neutral-100">{activeChar.name}</h2>
                    {activeChar.voice_only && (
                      <span className="text-[10px] uppercase tracking-widest text-purple-400 border border-purple-800/50 bg-purple-950/20 px-2 py-0.5">
                        Voice Only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 max-w-lg">
                    {activeChar.description}
                  </p>
                </div>
                {!activeChar.voice_only && activeChar.variations.length < TOTAL_VARIATIONS && (
                  <button
                    onClick={() => generateVariations(activeChar.id)}
                    disabled={generating}
                    className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-4 py-2 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
                  >
                    {generating && genProgress?.charName === activeChar.name
                      ? `${genProgress.current}/${genProgress.total}...`
                      : activeChar.variations.length === 0
                      ? "Generate"
                      : `Generate Remaining (${TOTAL_VARIATIONS - activeChar.variations.length})`}
                  </button>
                )}
              </div>

              {activeChar.voice_only ? (
                <div className="border border-purple-900/30 bg-purple-950/10 p-10 text-center">
                  <p className="text-purple-400 text-sm mb-2">Voice Only Character</p>
                  <p className="text-neutral-500 text-xs max-w-sm mx-auto">
                    This character is never physically present on screen — they appear only via voiceover, phone recording, or narration. No casting images are generated.
                  </p>
                  {activeChar.description && !activeChar.description.startsWith("No physical") && (
                    <p className="text-neutral-400 text-xs mt-4 italic max-w-sm mx-auto">
                      {activeChar.description}
                    </p>
                  )}
                </div>
              ) : activeChar.variations.length === 0 ? (
                <div className="border-2 border-dashed border-neutral-700 p-12 text-center">
                  <p className="text-neutral-500 text-sm">No variations generated yet</p>
                  <p className="text-neutral-600 text-xs mt-1">
                    Click &quot;Generate&quot; to create {TOTAL_VARIATIONS} casting variations
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {activeChar.variations.map((v) => (
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
                      {/* Image */}
                      <div className="aspect-square bg-neutral-900 relative">
                        <img
                          src={v.image_url}
                          alt={`${activeChar.name} variation ${v.variation_number}`}
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

                      {/* Actions */}
                      {v.status === "pending" && (
                        <div className="flex divide-x divide-neutral-800">
                          <button
                            onClick={() => updateVariation(v.id, activeChar.id, "approved")}
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

                      {v.status === "rejected" && v.rejection_note && (
                        <p className="px-2 py-1.5 text-[10px] text-red-400/70 truncate">
                          {v.rejection_note}
                        </p>
                      )}

                      {/* Reject with note */}
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
                                updateVariation(v.id, activeChar.id, "rejected", rejectNote)
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

                  {/* Skeleton placeholders for in-progress images */}
                  {generating &&
                    genProgress?.charName === activeChar.name &&
                    Array.from({
                      length: TOTAL_VARIATIONS - activeChar.variations.length,
                    }).map((_, i) => (
                      <div
                        key={`skeleton-${i}`}
                        className={`border border-neutral-800 ${
                          i === 0 ? "opacity-60" : "opacity-20"
                        }`}
                      >
                        <div className="aspect-square bg-neutral-800 animate-pulse" />
                      </div>
                    ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-neutral-500 text-sm">
              Select a character to view casting variations
            </p>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
