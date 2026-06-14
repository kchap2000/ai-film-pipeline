"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDictation } from "@/lib/use-dictation";
import type { RawFeedbackNote, RevisionPlan } from "@/lib/revision";

/**
 * REVISION_VISION R2 — Director's Notes rail in the Screening Room.
 *
 * The player tells this component which clip is on screen, so every note
 * auto-attaches {clip_id, scene_number, panel_number} — the director just
 * says what's wrong ("the dragon looks fake here"), typed or dictated.
 * Submit resolves the notes into a RevisionPlan (Claude) and shows a
 * confirm card with the cost preview before anything regenerates.
 */

interface ClipContext {
  clip_id: string;
  scene_number: number;
  panel_number: number;
}

interface DraftNote extends RawFeedbackNote {
  /** display chip, e.g. "S2·P04" */
  context_label?: string;
}

export default function DirectorNotes({
  projectId,
  sourceAssemblyId,
  currentClip,
  currentTime,
}: {
  projectId: string;
  sourceAssemblyId: string | null;
  currentClip: ClipContext | null;
  currentTime?: number | null;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftNote[]>([]);
  const [text, setText] = useState("");
  const [attachShot, setAttachShot] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RevisionPlan | null>(null);
  const [starting, setStarting] = useState(false);
  const [dictated, setDictated] = useState(false);

  const dictation = useDictation((t, isFinal) => {
    if (isFinal) {
      setText((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${t.trim()}`);
      setDictated(true);
    }
  });

  const addNote = () => {
    const t = text.trim();
    if (!t) return;
    const withContext = attachShot && currentClip;
    setDrafts((prev) => [
      ...prev,
      {
        text: t,
        via: dictated ? "dictated" : "typed",
        clip_id: withContext ? currentClip.clip_id : null,
        scene_number: withContext ? currentClip.scene_number : null,
        timestamp_s: withContext && typeof currentTime === "number" ? Math.round(currentTime) : null,
        context_label: withContext ? `S${currentClip.scene_number}·P${String(currentClip.panel_number).padStart(2, "0")}` : undefined,
      },
    ]);
    setText("");
    setDictated(false);
  };

  const submit = async () => {
    if (drafts.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_feedback: drafts.map(({ context_label: _cl, ...note }) => note),
          source_assembly_id: sourceAssemblyId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Revision request failed (${res.status})`);
      setRevisionId(data.revision?.id || null);
      setPlan(data.plan || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    if (!revisionId || starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision_id: revisionId, action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start the revision run");
      // The Auto Pilot page drives the run loop
      router.push(`/projects/${projectId}/pipeline`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  };

  const discard = async () => {
    if (revisionId) {
      fetch(`/api/projects/${projectId}/revisions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision_id: revisionId, action: "cancel" }),
      }).catch(() => {});
    }
    setRevisionId(null);
    setPlan(null);
  };

  return (
    <section className="rounded-xl p-6 mb-10" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
          🎬 Director&apos;s Notes
        </h2>
        {currentClip && (
          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
            Watching S{currentClip.scene_number}·P{String(currentClip.panel_number).padStart(2, "0")}
          </span>
        )}
      </div>

      {!plan ? (
        <>
          <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
            Say what&apos;s wrong, in plain language — type or dictate. Notes attach to the shot on screen.
            Submit them all at once and I&apos;ll build a targeted fix plan: only the flagged shots regenerate,
            then the film re-stitches as a new version.
          </p>

          {/* Input row */}
          <div className="flex gap-2 mb-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder={dictation.listening ? "Listening…" : 'e.g. "The dragon in this shot looks fake — too rubbery"'}
              className="flex-1 text-xs px-3 py-2.5 rounded-md outline-none"
              style={{
                background: "var(--brand-navy)",
                color: "var(--brand-white)",
                border: dictation.listening ? "1px solid rgba(239,68,68,0.6)" : "1px solid var(--brand-steel)",
              }}
            />
            {dictation.supported && (
              <button
                onClick={dictation.toggle}
                title={dictation.listening ? "Stop dictation" : "Dictate a note"}
                className={`text-sm px-3 py-2 rounded-md ${dictation.listening ? "animate-pulse" : ""}`}
                style={{
                  color: dictation.listening ? "#f87171" : "var(--brand-gray)",
                  border: dictation.listening ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--brand-steel)",
                }}
              >
                {dictation.listening ? "■" : "🎙"}
              </button>
            )}
            <button
              onClick={addNote}
              disabled={!text.trim()}
              className="text-[10px] uppercase tracking-widest px-4 py-2 disabled:opacity-40"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
            >
              Add Note
            </button>
          </div>
          <label className="flex items-center gap-2 text-[10px] mb-4" style={{ color: "var(--brand-gray)" }}>
            <input
              type="checkbox"
              checked={attachShot}
              onChange={(e) => setAttachShot(e.target.checked)}
              disabled={!currentClip}
            />
            Attach the shot currently on screen {currentClip ? `(S${currentClip.scene_number}·P${currentClip.panel_number})` : "(play a clip first)"}
          </label>

          {/* Draft notes */}
          {drafts.length > 0 && (
            <div className="space-y-2 mb-4">
              {drafts.map((n, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 px-3 py-2 rounded"
                  style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {n.context_label && (
                      <span className="text-[9px] uppercase tracking-widest flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}>
                        {n.context_label}
                      </span>
                    )}
                    <p className="text-xs leading-relaxed" style={{ color: "var(--brand-white)" }}>
                      {n.text}
                      {n.via === "dictated" && <span className="ml-1.5 text-[9px]" style={{ color: "var(--brand-gray)" }}>🎙</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs flex-shrink-0"
                    style={{ color: "var(--brand-gray)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-md px-3 py-2 mb-3 text-[11px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={drafts.length === 0 || submitting}
            className="text-xs uppercase tracking-widest px-5 py-2.5 disabled:opacity-40"
            style={{ background: drafts.length > 0 ? "var(--brand-orange)" : "transparent", color: drafts.length > 0 ? "var(--brand-navy)" : "var(--brand-gray)", border: "1px solid rgba(255,138,42,0.4)", fontWeight: 700 }}
          >
            {submitting ? "Building fix plan…" : `Submit ${drafts.length || ""} note${drafts.length === 1 ? "" : "s"} & build revision`}
          </button>
        </>
      ) : (
        /* ── Plan confirm card ───────────────────────────── */
        <div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--brand-white)" }}>{plan.summary}</p>
          <div className="space-y-1.5 mb-4">
            {plan.targets.map((t, i) => (
              <div key={i} className="px-3 py-2 rounded text-[11px]" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                <span className="uppercase tracking-widest text-[9px] mr-2" style={{ color: "var(--brand-cyan)" }}>
                  {t.action.replace(/_/g, " ")}
                </span>
                <span style={{ color: "var(--brand-gray)" }}>
                  {t.panel_ids?.length ? `${t.panel_ids.length} shot${t.panel_ids.length === 1 ? "" : "s"} — ` : ""}
                </span>
                <span style={{ color: "var(--brand-white)" }}>{t.correction}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] mb-4" style={{ color: "var(--brand-orange)" }}>
            Will regenerate {plan.estimated_units.frames} frame{plan.estimated_units.frames === 1 ? "" : "s"} +{" "}
            {plan.estimated_units.clips} clip{plan.estimated_units.clips === 1 ? "" : "s"}, then re-assemble and re-stitch a new version.
          </p>
          {error && (
            <div className="rounded-md px-3 py-2 mb-3 text-[11px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={approve}
              disabled={starting}
              className="text-xs uppercase tracking-widest px-5 py-2.5 disabled:opacity-40"
              style={{ background: "var(--brand-orange)", color: "var(--brand-navy)", fontWeight: 700 }}
            >
              {starting ? "Starting revision run…" : "Run revision"}
            </button>
            <button
              onClick={discard}
              disabled={starting}
              className="text-xs uppercase tracking-widest px-4 py-2.5"
              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
            >
              Edit notes
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
