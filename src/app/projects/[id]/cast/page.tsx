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

const ROLE_COLORS: Record<string, { color: string; background: string; border: string }> = {
  lead:       { color: "var(--brand-orange)", background: "rgba(255,138,42,0.08)", border: "rgba(255,138,42,0.35)" },
  supporting: { color: "var(--brand-cyan)",   background: "rgba(76,201,240,0.08)",  border: "rgba(76,201,240,0.3)" },
  minor:      { color: "var(--brand-gray)",   background: "transparent",            border: "var(--brand-steel)" },
  extra:      { color: "var(--brand-gray)",   background: "transparent",            border: "var(--brand-steel)" },
  mentioned:  { color: "var(--brand-gray)",   background: "transparent",            border: "var(--brand-steel)" },
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

  const generateVariations = async (characterId?: string) => {
    setGenerating(true);
    setGenErrors([]);
    const errors: string[] = [];

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

        let fetchAfter = true;
        try {
          const postRes = await fetch(`/api/projects/${id}/cast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              character_id: char.id,
              variation_number: variationNum,
            }),
          });

          // Guard against Vercel returning HTML on timeout instead of JSON
          let postData: { error?: string } = {};
          try {
            postData = await postRes.json();
          } catch {
            errors.push(
              `${char.name} #${variationNum}: ${
                postRes.status === 504 || postRes.status === 502
                  ? "Timed out — server took too long. Try generating individually."
                  : `Server error (${postRes.status}), please retry.`
              }`
            );
            fetchAfter = false; // don't trigger a re-render blink on hard failures
          }

          if (!postRes.ok && postData.error) {
            errors.push(`${char.name} #${variationNum}: ${postData.error}`);
          }
        } catch (err) {
          errors.push(`${char.name} #${variationNum}: ${err instanceof Error ? err.message : "Network error"}`);
          fetchAfter = false;
        }

        if (fetchAfter) await fetchCast();
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
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading casting data...
      </div>
    );
  }

  const activeChar = characters.find((c) => c.id === selectedChar);
  const castableChars = characters.filter((c) => !c.voice_only);
  const hasVariations = castableChars.some((c) => c.variations.length > 0);
  const allCast = castableChars.length > 0 && castableChars.every((c) => c.approved_cast_id !== null && c.variations.length > 0);

  if (characters.length === 0) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <Link
            href={`/projects/${id}`}
            className="text-[10px] uppercase tracking-[0.25em] transition-colors"
            style={{ color: "var(--brand-orange)" }}
          >
            &larr; Back to Project
          </Link>
          <div
            className="rounded-xl p-10 mt-8 text-center"
            style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
          >
            <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No characters found</p>
            <p className="text-xs mb-6" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
              Characters are populated by running LLM Extraction on your uploaded script.
            </p>
            <div className="flex justify-center gap-4">
              <Link
                href={`/projects/${id}`}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              >
                Go to Project &rarr; Run Extraction
              </Link>
              <Link
                href={`/projects/${id}/bible`}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
                style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
              >
                View Film Bible
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              AI Casting
            </h1>
            <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
              {castableChars.length} castable characters &middot; {TOTAL_VARIATIONS} variations each
              {characters.length > castableChars.length && (
                <span style={{ opacity: 0.6 }}>
                  {" "}&middot; {characters.length - castableChars.length} voice-only
                </span>
              )}
            </p>
          </div>
          {!hasVariations && (
            <button
              onClick={() => generateVariations()}
              disabled={generating}
              className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {generating ? "Generating..." : "Generate All Variations"}
            </button>
          )}
        </div>
      </header>

      {/* Generation progress bar */}
      {genProgress && (
        <div
          className="p-4 mb-6 rounded-xl"
          style={{ border: "1px solid rgba(255,138,42,0.3)", background: "rgba(255,138,42,0.06)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
              Generating {genProgress.charName} — {genProgress.current} / {genProgress.total}
            </p>
            <p className="text-xs" style={{ color: "var(--brand-gray)" }}>Images appear as they complete</p>
          </div>
          <div className="w-full h-1 rounded-full" style={{ background: "var(--brand-steel)" }}>
            <div
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: `${(genProgress.current / genProgress.total) * 100}%`,
                background: "var(--brand-orange)",
              }}
            />
          </div>
        </div>
      )}

      {/* Generation errors */}
      {genErrors.length > 0 && (
        <div className="p-4 mb-6 rounded-xl" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
          <p className="text-red-400 text-xs font-bold mb-2 uppercase tracking-widest">Generation Errors</p>
          {genErrors.slice(0, 5).map((err, i) => (
            <p key={i} className="text-red-400/80 text-xs">{err}</p>
          ))}
          {genErrors.length > 5 && (
            <p className="text-red-400/60 text-xs mt-1">...and {genErrors.length - 5} more</p>
          )}
        </div>
      )}

      <div className="flex gap-8">
        {/* Character Sidebar */}
        <nav className="w-56 flex-shrink-0 space-y-1">
          <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Characters
          </p>
          {characters.map((char) => {
            const charHasVariations = char.variations.length > 0;
            const approved = char.approved_cast_id !== null && charHasVariations;
            const hasPending = charHasVariations && char.variations.some((v) => v.status === "pending");
            const isSelected = selectedChar === char.id;
            const rc = ROLE_COLORS[char.role] || ROLE_COLORS.minor;
            return (
              <button
                key={char.id}
                onClick={() => setSelectedChar(char.id)}
                className="w-full text-left px-4 py-3 rounded-lg transition-colors"
                style={{
                  border: isSelected
                    ? "1px solid var(--brand-orange)"
                    : "1px solid var(--brand-steel)",
                  background: isSelected ? "rgba(255,138,42,0.08)" : "var(--brand-mid)",
                  opacity: char.voice_only ? 0.6 : 1,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm"
                    style={{ color: isSelected ? "var(--brand-orange)" : "var(--brand-white)" }}
                  >
                    {char.name}
                  </span>
                  {char.voice_only ? (
                    <span className="text-purple-400 text-[9px] uppercase tracking-widest">V.O.</span>
                  ) : approved ? (
                    <span className="text-green-500 text-[10px]">CAST</span>
                  ) : hasPending ? (
                    <span className="text-[10px]" style={{ color: "var(--brand-orange)" }}>REVIEW</span>
                  ) : null}
                </div>
                <span
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: rc.color }}
                >
                  {char.role}
                </span>
              </button>
            );
          })}

          {allCast && characters.length > 0 && (
            <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
              <p className="text-green-500 text-[10px] uppercase tracking-widest mb-2">
                All characters cast
              </p>
              <Link href={`/projects/${id}`} className="text-xs" style={{ color: "var(--brand-orange)" }}>
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
                    <h2 className="text-xl" style={{ color: "var(--brand-white)" }}>{activeChar.name}</h2>
                    {activeChar.voice_only && (
                      <span className="text-[10px] uppercase tracking-widest text-purple-400 border border-purple-800/50 bg-purple-950/20 px-2 py-0.5">
                        Voice Only
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 max-w-lg" style={{ color: "var(--brand-gray)" }}>
                    {activeChar.description}
                  </p>
                </div>
                {!activeChar.voice_only && activeChar.variations.length < TOTAL_VARIATIONS && (
                  <button
                    onClick={() => generateVariations(activeChar.id)}
                    disabled={generating}
                    className="text-xs uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
                    style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
                <div className="rounded-xl p-10 text-center" style={{ border: "1px solid rgba(147,51,234,0.3)", background: "rgba(147,51,234,0.06)" }}>
                  <p className="text-purple-400 text-sm mb-2">Voice Only Character</p>
                  <p className="text-xs max-w-sm mx-auto" style={{ color: "var(--brand-gray)" }}>
                    This character is never physically present on screen — they appear only via voiceover, phone recording, or narration. No casting images are generated.
                  </p>
                  {activeChar.description && !activeChar.description.startsWith("No physical") && (
                    <p className="text-xs mt-4 italic max-w-sm mx-auto" style={{ color: "var(--brand-gray)" }}>
                      {activeChar.description}
                    </p>
                  )}
                </div>
              ) : activeChar.variations.length === 0 ? (
                <div
                  className="rounded-xl p-12 text-center"
                  style={{ border: "2px dashed var(--brand-steel)" }}
                >
                  <p className="text-sm" style={{ color: "var(--brand-gray)" }}>No variations generated yet</p>
                  <p className="text-xs mt-1" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                    Click &quot;Generate&quot; to create {TOTAL_VARIATIONS} casting variations
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {activeChar.variations.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg overflow-hidden transition-colors"
                      style={{
                        border: v.status === "approved"
                          ? "1px solid rgba(34,197,94,0.5)"
                          : v.status === "rejected"
                          ? "1px solid rgba(239,68,68,0.2)"
                          : "1px solid var(--brand-steel)",
                        background: v.status === "approved"
                          ? "rgba(34,197,94,0.05)"
                          : "var(--brand-mid)",
                        opacity: v.status === "rejected" ? 0.4 : 1,
                      }}
                    >
                      <div className="aspect-square relative" style={{ background: "var(--brand-navy)" }}>
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

                      {v.status === "pending" && (
                        <div className="flex" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                          <button
                            onClick={() => updateVariation(v.id, activeChar.id, "approved")}
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

                      {v.status === "rejected" && v.rejection_note && (
                        <p className="px-2 py-1.5 text-[10px] text-red-400/70 truncate">
                          {v.rejection_note}
                        </p>
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
                            onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(239,68,68,0.5)")}
                            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => updateVariation(v.id, activeChar.id, "rejected", rejectNote)}
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

                  {generating &&
                    genProgress?.charName === activeChar.name &&
                    Array.from({
                      length: TOTAL_VARIATIONS - activeChar.variations.length,
                    }).map((_, i) => (
                      <div
                        key={`skeleton-${i}`}
                        className="rounded-lg overflow-hidden"
                        style={{
                          border: "1px solid var(--brand-steel)",
                          opacity: i === 0 ? 0.6 : 0.2,
                        }}
                      >
                        <div className="aspect-square animate-pulse" style={{ background: "var(--brand-steel)" }} />
                      </div>
                    ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
              Select a character to view casting variations
            </p>
          )}
        </div>
      </div>
    </div>
    </div>
    </>
  );
}
