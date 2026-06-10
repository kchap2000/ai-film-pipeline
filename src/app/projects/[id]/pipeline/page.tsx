"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";
import { PIPELINE_STEP_ORDER, PIPELINE_STEP_LABELS, PipelineStep, PipelineRun } from "@/lib/types";

/**
 * Auto Mode control room. Start a run, then this page drives the
 * orchestrator loop client-side: POST {action:"step"} → render progress →
 * repeat until completed/failed/paused. Refresh-safe: the run state lives
 * in pipeline_runs, so reopening this page resumes the loop.
 */
export default function PipelinePage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [looping, setLooping] = useState(false);
  const [workLog, setWorkLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loopRef = useRef(false);

  const fetchRun = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/auto-pipeline`);
    if (res.ok) {
      const data = await res.json();
      setRun(data.run);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchRun();
    return () => {
      loopRef.current = false;
    };
  }, [fetchRun]);

  const stepLoop = useCallback(async () => {
    if (loopRef.current) return;
    loopRef.current = true;
    setLooping(true);
    setError(null);
    try {
      // Drive steps until the run finishes or the user stops the loop
      // eslint-disable-next-line no-constant-condition
      while (loopRef.current) {
        const res = await fetch(`/api/projects/${id}/auto-pipeline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || `Step failed (${res.status})`);
          if (data.run) setRun(data.run);
          break;
        }
        if (data.run) setRun(data.run);
        if (data.work) setWorkLog((prev) => [...prev.slice(-49), data.work]);
        if (!data.run || ["completed", "failed", "paused"].includes(data.run.status)) break;
      }
    } finally {
      loopRef.current = false;
      setLooping(false);
    }
  }, [id]);

  const startRun = async () => {
    setError(null);
    setWorkLog([]);
    const res = await fetch(`/api/projects/${id}/auto-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not start run");
      return;
    }
    setRun(data.run);
    stepLoop();
  };

  const pauseRun = async () => {
    loopRef.current = false;
    await fetch(`/api/projects/${id}/auto-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    await fetchRun();
  };

  const resumeRun = async () => {
    await fetch(`/api/projects/${id}/auto-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    await fetchRun();
    stepLoop();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Loading pipeline…
      </div>
    );
  }

  const currentIndex = run ? PIPELINE_STEP_ORDER.indexOf(run.current_step as PipelineStep) : -1;
  const isActive = run && run.status === "running";
  const isDone = run?.status === "completed";

  return (
    <>
      <ProjectNav projectId={id} />
      <div className="min-h-screen pb-24" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-4xl mx-auto px-6 py-10">
          <header className="pb-6 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link href={`/projects/${id}`} className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
              &larr; Back to Project
            </Link>
            <div className="flex items-end justify-between mt-4 gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>Auto Pipeline</h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  Script in → video out. Every gate auto-selected by AI. {run ? `Run status: ${run.status}` : "No run yet."}
                </p>
              </div>
              <div className="flex gap-3">
                {!run || ["completed", "failed"].includes(run.status) ? (
                  <button
                    onClick={startRun}
                    disabled={looping}
                    className="text-xs uppercase tracking-widest px-6 py-3 text-green-400 border border-green-800/50 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                  >
                    {run?.status === "failed" ? "Restart Run" : run?.status === "completed" ? "Run Again" : "Start Auto Run"}
                  </button>
                ) : run.status === "paused" ? (
                  <button
                    onClick={resumeRun}
                    className="text-xs uppercase tracking-widest px-6 py-3 text-green-400 border border-green-800/50 hover:bg-green-950/30 transition-colors"
                  >
                    Resume
                  </button>
                ) : (
                  <>
                    {!looping && (
                      <button
                        onClick={() => stepLoop()}
                        className="text-xs uppercase tracking-widest px-6 py-3 text-green-400 border border-green-800/50 hover:bg-green-950/30 transition-colors"
                      >
                        Continue Run
                      </button>
                    )}
                    <button
                      onClick={pauseRun}
                      className="text-xs uppercase tracking-widest px-6 py-3 transition-colors"
                      style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                    >
                      Pause
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>

          {error && (
            <div className="rounded-md px-4 py-3 mb-6 text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              {error} — the run is resumable; fix the issue and hit Continue/Restart.
            </div>
          )}

          {isDone && (
            <div className="rounded-xl p-6 mb-8 text-center" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.4)" }}>
              <p className="text-xs uppercase tracking-widest text-green-400 mb-2">Pipeline Complete</p>
              <p className="text-xl font-bold mb-3" style={{ color: "var(--brand-white)" }}>Your film is ready</p>
              <div className="flex gap-3 justify-center">
                <Link href={`/projects/${id}/video/watch`} className="text-xs uppercase tracking-widest px-5 py-2.5 text-green-400 border border-green-800/50 hover:bg-green-950/30 transition-colors">
                  Watch + QA Report →
                </Link>
                <Link href={`/projects/${id}/video`} className="text-xs uppercase tracking-widest px-5 py-2.5" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}>
                  Review Clips
                </Link>
              </div>
            </div>
          )}

          {/* Step ladder */}
          <section className="mb-8">
            <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>Pipeline Steps</h2>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--brand-steel)" }}>
              {PIPELINE_STEP_ORDER.filter((s) => s !== "done").map((step, i) => {
                const stepIdx = PIPELINE_STEP_ORDER.indexOf(step);
                const isCurrent = run && run.current_step === step && run.status !== "completed";
                const isComplete = isDone || (currentIndex > -1 && stepIdx < currentIndex);
                const timing = run?.phase_timings?.[step];
                return (
                  <div
                    key={step}
                    className="flex items-center justify-between px-5 py-3"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--brand-steel)" : "none",
                      background: isCurrent ? "rgba(255,138,42,0.05)" : "var(--brand-mid)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] flex-shrink-0"
                        style={{
                          background: isComplete ? "rgba(34,197,94,0.15)" : isCurrent ? "rgba(255,138,42,0.15)" : "var(--brand-navy)",
                          border: isComplete ? "1px solid rgba(34,197,94,0.4)" : isCurrent ? "1px solid rgba(255,138,42,0.5)" : "1px solid var(--brand-steel)",
                          color: isComplete ? "#4ade80" : isCurrent ? "var(--brand-orange)" : "var(--brand-gray)",
                        }}
                      >
                        {isComplete ? "✓" : i + 1}
                      </span>
                      <span className="text-xs" style={{ color: isCurrent ? "var(--brand-orange)" : isComplete ? "var(--brand-white)" : "var(--brand-gray)" }}>
                        {PIPELINE_STEP_LABELS[step]}
                        {isCurrent && isActive && looping && <span className="animate-pulse"> · running…</span>}
                      </span>
                    </div>
                    {timing !== undefined && (
                      <span className="text-[10px]" style={{ color: "var(--brand-gray)" }}>
                        {Math.round(Number(timing))}s
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Live work log */}
          {workLog.length > 0 && (
            <section className="mb-8">
              <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>Work Log</h2>
              <div className="rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-[11px] space-y-1" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                {[...workLog].reverse().map((w, i) => (
                  <p key={i} style={{ color: i === 0 ? "var(--brand-orange)" : "var(--brand-gray)" }}>{w}</p>
                ))}
              </div>
            </section>
          )}

          {/* Error log from the run record */}
          {run && run.error_log?.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>Run Errors</h2>
              <div className="rounded-xl p-4 space-y-1" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.25)" }}>
                {run.error_log.map((e, i) => (
                  <p key={i} className="text-[11px]" style={{ color: "#fca5a5" }}>
                    [{e.step}] {e.error}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
