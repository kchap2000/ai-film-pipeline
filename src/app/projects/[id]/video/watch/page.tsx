"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface ManifestEntry {
  clip_id: string;
  video_url: string;
  duration: number | null;
  scene_number: number;
  panel_number: number;
}

interface Assembly {
  id: string;
  scope: "scene" | "full";
  scene_id: string | null;
  video_url: string | null;
  manifest: ManifestEntry[];
  duration_seconds: number | null;
  clip_count: number;
  status: string;
  created_at: string;
}

interface QAReportRow {
  id: string;
  overall_score: number | null;
  beat_accuracy: Array<{ scene_number: number; score: number; notes: string }>;
  character_flags: Array<{ character: string; issue: string; shots: string[] }>;
  mood_flags: Array<{ scene_number: number; expected: string; observed: string }>;
  regen_targets: Array<{ panel_id: string; scene_number: number; panel_number: number; reason: string }>;
  created_at: string;
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [assembly, setAssembly] = useState<Assembly | null>(null);
  const [qaReport, setQaReport] = useState<QAReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [clipIndex, setClipIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runningQA, setRunningQA] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fetchData = useCallback(async () => {
    const [assemblyRes, qaRes] = await Promise.all([
      fetch(`/api/projects/${id}/assembly`),
      fetch(`/api/projects/${id}/qa`),
    ]);
    if (assemblyRes.ok) {
      const data = await assemblyRes.json();
      setAssembly(data.latest_full || null);
    }
    if (qaRes.ok) {
      const data = await qaRes.json();
      setQaReport(data.latest || null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const manifest = assembly?.manifest || [];
  const current = manifest[clipIndex] || null;

  // Sequential playback — when a clip ends, advance to the next one.
  const handleEnded = () => {
    if (clipIndex < manifest.length - 1) {
      setClipIndex((i) => i + 1);
    } else {
      setPlaying(false);
    }
  };

  // Autoplay on index change while in "playing" mode
  useEffect(() => {
    if (playing && videoRef.current) {
      videoRef.current.play().catch(() => setPlaying(false));
    }
  }, [clipIndex, playing]);

  const runQA = async () => {
    setRunningQA(true);
    setQaError(null);
    try {
      const res = await fetch(`/api/projects/${id}/qa`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "QA analysis failed");
      await fetchData();
    } catch (err) {
      setQaError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningQA(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Loading screening room…
      </div>
    );
  }

  return (
    <>
      <ProjectNav projectId={id} />
      <div className="min-h-screen pb-24" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-5xl mx-auto px-6 py-10">
          <header className="pb-6 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link href={`/projects/${id}/video`} className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
              &larr; Back to Clips
            </Link>
            <div className="flex items-end justify-between mt-4 gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>Screening Room</h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  {assembly
                    ? `${assembly.clip_count} clips · ~${Math.round(Number(assembly.duration_seconds) || 0)}s · assembled ${new Date(assembly.created_at).toLocaleString()}`
                    : "No assembly yet"}
                </p>
              </div>
              <button
                onClick={runQA}
                disabled={runningQA || !assembly}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
              >
                {runningQA ? "Analyzing beats…" : qaReport ? "Re-run QA Analysis" : "Run QA Analysis"}
              </button>
            </div>
          </header>

          {!assembly ? (
            <div className="rounded-xl p-12 text-center" style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}>
              <p className="text-sm mb-3" style={{ color: "var(--brand-gray)" }}>Nothing assembled yet.</p>
              <Link href={`/projects/${id}/video`} className="text-xs" style={{ color: "var(--brand-orange)" }}>
                &rarr; Generate clips, then assemble
              </Link>
            </div>
          ) : (
            <>
              {/* Player — a stitched single file (assembly.video_url, made by
                  scripts/stitch-film.mjs) takes priority over the per-clip
                  sequential playlist. */}
              <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--brand-steel)" }}>
                <div className="aspect-video" style={{ background: "black" }}>
                  {assembly.video_url ? (
                    <video key="stitched" src={assembly.video_url} controls className="w-full h-full" />
                  ) : current ? (
                    <video
                      ref={videoRef}
                      key={current.clip_id}
                      src={current.video_url}
                      controls
                      onEnded={handleEnded}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--brand-gray)" }}>
                      No clip
                    </div>
                  )}
                </div>
              </div>
              {assembly.video_url && (
                <div className="flex items-center justify-between mb-8">
                  <span className="text-[10px] uppercase tracking-widest text-green-400">
                    Stitched film — single file
                  </span>
                  <a
                    href={assembly.video_url}
                    download
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5"
                    style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                  >
                    Download MP4
                  </a>
                </div>
              )}
              {!assembly.video_url && (
              <div className="flex items-center justify-between mb-8">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                  {current ? `Scene ${current.scene_number} · Panel ${String(current.panel_number).padStart(2, "0")} · Clip ${clipIndex + 1}/${manifest.length}` : ""}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setClipIndex((i) => Math.max(0, i - 1))}
                    disabled={clipIndex === 0}
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-30"
                    style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => { setPlaying(true); videoRef.current?.play().catch(() => {}); }}
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 text-green-400 border border-green-800/50"
                  >
                    Play All
                  </button>
                  <button
                    onClick={() => setClipIndex((i) => Math.min(manifest.length - 1, i + 1))}
                    disabled={clipIndex >= manifest.length - 1}
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-30"
                    style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                  >
                    Next →
                  </button>
                </div>
              </div>
              )}

              {/* Clip strip */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-10">
                {manifest.map((m, i) => (
                  <button
                    key={m.clip_id}
                    onClick={() => setClipIndex(i)}
                    className="flex-shrink-0 text-[9px] uppercase tracking-widest px-3 py-2 rounded transition-colors"
                    style={{
                      color: i === clipIndex ? "var(--brand-orange)" : "var(--brand-gray)",
                      border: i === clipIndex ? "1px solid rgba(255,138,42,0.5)" : "1px solid var(--brand-steel)",
                      background: i === clipIndex ? "rgba(255,138,42,0.06)" : "var(--brand-mid)",
                    }}
                  >
                    S{m.scene_number}·P{m.panel_number}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* QA Report */}
          {qaError && (
            <div className="rounded-md px-4 py-3 mb-6 text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              {qaError}
            </div>
          )}
          {qaReport && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                QA Beat Analysis
              </h2>
              <div className="rounded-xl p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                    style={{
                      border: `3px solid ${Number(qaReport.overall_score) >= 80 ? "#4ade80" : Number(qaReport.overall_score) >= 60 ? "#FF8A2A" : "#f87171"}`,
                      color: Number(qaReport.overall_score) >= 80 ? "#4ade80" : Number(qaReport.overall_score) >= 60 ? "#FF8A2A" : "#f87171",
                    }}
                  >
                    {Math.round(Number(qaReport.overall_score) || 0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>Overall beat accuracy</p>
                    <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                      Analyzed {new Date(qaReport.created_at).toLocaleString()} · {qaReport.regen_targets.length} regen target{qaReport.regen_targets.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                {qaReport.beat_accuracy.length > 0 && (
                  <div className="mb-6">
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Per-Scene Beats</p>
                    <div className="space-y-2">
                      {qaReport.beat_accuracy.map((b, i) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2 rounded" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                          <span className="text-xs font-bold flex-shrink-0" style={{ color: b.score >= 80 ? "#4ade80" : b.score >= 60 ? "#FF8A2A" : "#f87171" }}>
                            {b.score}
                          </span>
                          <div>
                            <p className="text-xs" style={{ color: "var(--brand-white)" }}>Scene {b.scene_number}</p>
                            <p className="text-[11px]" style={{ color: "var(--brand-gray)" }}>{b.notes}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {qaReport.character_flags.length > 0 && (
                  <div className="mb-6">
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Character Consistency</p>
                    {qaReport.character_flags.map((f, i) => (
                      <p key={i} className="text-[11px] mb-1" style={{ color: "#fca5a5" }}>
                        {f.character}: {f.issue}
                      </p>
                    ))}
                  </div>
                )}

                {qaReport.mood_flags.length > 0 && (
                  <div className="mb-6">
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Mood Alignment</p>
                    {qaReport.mood_flags.map((f, i) => (
                      <p key={i} className="text-[11px] mb-1" style={{ color: "var(--brand-gray)" }}>
                        Scene {f.scene_number}: expected <span style={{ color: "var(--brand-orange)" }}>{f.expected}</span>, reads as <span style={{ color: "#fca5a5" }}>{f.observed}</span>
                      </p>
                    ))}
                  </div>
                )}

                {qaReport.regen_targets.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Recommended Regenerations</p>
                    {qaReport.regen_targets.map((t, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded mb-1" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                        <span className="text-[11px]" style={{ color: "var(--brand-white)" }}>
                          Scene {t.scene_number} · Panel {t.panel_number} — {t.reason}
                        </span>
                        <Link
                          href={`/projects/${id}/first-frames`}
                          className="text-[9px] uppercase tracking-widest px-2 py-1 flex-shrink-0"
                          style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                        >
                          Fix →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
