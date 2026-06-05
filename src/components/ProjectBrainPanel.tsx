"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BRAIN_INTENTS,
  BRAIN_PRIORITIES,
  CONTINUITY_CATEGORIES,
  type BrainIntent,
  type BrainPriority,
  type BrainTargetType,
  type ContinuityCategory,
} from "@/lib/project-brain";
import type { BrainContextPayload } from "@/components/BrainTargetButton";

interface FeedbackItem {
  id: string;
  target_type: BrainTargetType;
  target_id: string | null;
  target_label: string;
  phase: string | null;
  intent: BrainIntent;
  priority: BrainPriority;
  status: "open" | "applied" | "ignored" | "resolved";
  body: string;
  transcript_source: string | null;
  created_at: string;
}

interface ContinuityRule {
  id: string;
  scope_type: BrainTargetType;
  scope_id: string | null;
  scope_label: string;
  category: ContinuityCategory;
  rule_text: string;
  strength: BrainPriority;
  created_at: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

function phaseFromPath(pathname: string) {
  if (pathname.endsWith("/cast")) return "casting";
  if (pathname.endsWith("/lock")) return "character_lock";
  if (pathname.endsWith("/locations")) return "locations";
  if (pathname.endsWith("/scenes")) return "scene_scout";
  if (pathname.endsWith("/storyboard")) return "storyboard";
  if (pathname.endsWith("/first-frames")) return "first_frames";
  if (pathname.endsWith("/bible")) return "bible";
  return "project";
}

function labelFor(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const source = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return source.SpeechRecognition || source.webkitSpeechRecognition || null;
}

function isBrainContextPayload(value: unknown): value is BrainContextPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BrainContextPayload>;
  return typeof candidate.targetType === "string" && typeof candidate.targetLabel === "string";
}

export default function ProjectBrainPanel({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const defaultPhase = useMemo(() => phaseFromPath(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<BrainContextPayload>({
    targetType: "project",
    targetId: null,
    targetLabel: "Whole Project",
    phase: defaultPhase,
    intent: "feedback",
    priority: "important",
    category: "continuity",
  });
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [continuity, setContinuity] = useState<ContinuityRule[]>([]);
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState<BrainIntent>("feedback");
  const [priority, setPriority] = useState<BrainPriority>("important");
  const [category, setCategory] = useState<ContinuityCategory>("continuity");
  const [saveAsRule, setSaveAsRule] = useState(false);
  const [transcriptSource, setTranscriptSource] = useState<"typed" | "speech">("typed");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const activeContext = useMemo(
    () => ({
      ...context,
      phase: context.phase || defaultPhase,
    }),
    [context, defaultPhase]
  );

  const fetchBrain = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const params = new URLSearchParams({
      target_type: activeContext.targetType,
    });
    if (activeContext.targetId) params.set("target_id", activeContext.targetId);
    const res = await fetch(`/api/projects/${projectId}/brain?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setListError(data.error || "Could not load Project Brain.");
    } else {
      setFeedback(data.feedback || []);
      setContinuity(data.continuity || []);
    }
    setListLoading(false);
  }, [activeContext.targetId, activeContext.targetType, projectId]);

  useEffect(() => {
    const openWithContext = (detail: BrainContextPayload) => {
      setContext({
        targetType: detail.targetType || "project",
        targetId: detail.targetId ?? null,
        targetLabel: detail.targetLabel || "Selected Asset",
        phase: detail.phase || defaultPhase,
        intent: detail.intent || "feedback",
        priority: detail.priority || "important",
        category: detail.category || "continuity",
      });
      setIntent(detail.intent || "feedback");
      setPriority(detail.priority || "important");
      setCategory(detail.category || "continuity");
      setSaveAsRule(detail.intent === "continuity_rule");
      setStatus(null);
      setOpen(true);
    };

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<BrainContextPayload>).detail;
      if (isBrainContextPayload(detail)) openWithContext(detail);
    };

    const clickFallback = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-project-brain-target]") : null;
      const rawPayload = target?.dataset.projectBrainTarget;
      if (!rawPayload) return;
      try {
        const detail = JSON.parse(rawPayload) as unknown;
        if (isBrainContextPayload(detail)) openWithContext(detail);
      } catch {
        setStatus("Could not read this Project Brain context.");
      }
    };

    window.addEventListener("project-brain:open", handler);
    document.addEventListener("click", clickFallback);
    return () => {
      window.removeEventListener("project-brain:open", handler);
      document.removeEventListener("click", clickFallback);
    };
  }, [defaultPhase]);

  useEffect(() => {
    if (open) fetchBrain();
  }, [fetchBrain, open]);

  useEffect(() => {
    if (!open) return;
    setContext((prev) => ({ ...prev, phase: prev.phase || defaultPhase }));
  }, [defaultPhase, open]);

  const saveFeedback = async (override?: Partial<{ intent: BrainIntent; createRule: boolean; priority: BrainPriority; action: string }>) => {
    const text = body.trim();
    if (!text) {
      setStatus("Add a note first.");
      return;
    }
    setSaving(true);
    setStatus(null);
    const effectiveIntent = override?.intent || intent;
    const effectivePriority = override?.priority || priority;
    const res = await fetch(`/api/projects/${projectId}/brain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_type: activeContext.targetType,
        target_id: activeContext.targetId,
        target_label: activeContext.targetLabel,
        phase: activeContext.phase,
        intent: effectiveIntent,
        priority: effectivePriority,
        category,
        body: text,
        transcript_source: transcriptSource,
        create_rule: override?.createRule ?? saveAsRule,
        action: override?.action || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setStatus(data.error || "Could not save note.");
      return;
    }
    setBody("");
    setTranscriptSource("typed");
    if (effectiveIntent === "regenerate") {
      const regeneration = data.regeneration;
      if (regeneration?.executed && regeneration.frames_generated > 0) {
        setStatus(`Regenerated ${regeneration.frames_generated} frame${regeneration.frames_generated === 1 ? "" : "s"}.`);
      } else if (regeneration?.supported === false) {
        setStatus(regeneration.reason || "Regeneration request saved, but this target is not automated yet.");
      } else {
        setStatus("Regeneration request saved. No new frame was generated.");
      }
    } else {
      setStatus(data.continuity_rule ? "Saved as feedback and continuity." : "Feedback saved.");
    }
    await fetchBrain();
  };

  const updateFeedbackStatus = async (feedbackId: string, nextStatus: FeedbackItem["status"]) => {
    const res = await fetch(`/api/projects/${projectId}/brain`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_id: feedbackId, status: nextStatus }),
    });
    if (res.ok) {
      await fetchBrain();
    }
  };

  const toggleSpeech = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setStatus("Speech transcription is not available in this browser.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
      }
      if (finalText.trim()) {
        setBody((prev) => `${prev}${prev ? " " : ""}${finalText.trim()}`);
        setTranscriptSource("speech");
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setStatus("Speech transcription stopped. You can keep typing or try again.");
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const openForProject = () => {
    setContext({
      targetType: "project",
      targetId: null,
      targetLabel: "Whole Project",
      phase: defaultPhase,
      intent: "feedback",
      priority: "important",
      category: "continuity",
    });
    setIntent("feedback");
    setPriority("important");
    setCategory("continuity");
    setSaveAsRule(false);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openForProject}
        className="fixed bottom-4 right-4 z-40 border px-3 py-4 text-[10px] uppercase tracking-widest shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
        style={{
          writingMode: "vertical-rl",
          borderColor: "rgba(76,201,240,0.45)",
          background: "rgba(11,28,45,0.96)",
          color: "var(--brand-cyan)",
        }}
      >
        Project Brain
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close Project Brain"
            className="absolute inset-0 bg-black/45"
            onClick={() => setOpen(false)}
          />
          <aside
            className="relative h-full w-full max-w-xl overflow-y-auto border-l p-6 shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(11,28,45,0.99), rgba(20,43,68,0.99))",
              borderColor: "var(--brand-steel)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "var(--brand-orange)" }}>
                  Project Brain
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Director Notes</h2>
                <p className="mt-2 text-sm" style={{ color: "var(--brand-gray)" }}>
                  Current context: {activeContext.targetLabel}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>
                  {labelFor(activeContext.phase || "project")} · {labelFor(activeContext.targetType)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border px-3 py-2 text-sm"
                style={{ borderColor: "var(--brand-steel)", color: "var(--brand-gray)" }}
              >
                Close
              </button>
            </div>

            <div className="mt-6 border p-4" style={{ borderColor: "var(--brand-steel)", background: "rgba(11,28,45,0.55)" }}>
              <textarea
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  if (transcriptSource !== "speech") setTranscriptSource("typed");
                }}
                placeholder="Type or dictate a note. Example: Keep her red leather jacket in every scene, and regenerate this shot closer and tenser."
                rows={6}
                className="w-full resize-none border p-3 text-sm outline-none"
                style={{
                  background: "rgba(11,28,45,0.92)",
                  borderColor: "var(--brand-steel)",
                  color: "var(--brand-white)",
                }}
              />

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                  Intent
                  <select
                    value={intent}
                    onChange={(event) => {
                      const next = event.target.value as BrainIntent;
                      setIntent(next);
                      if (next === "continuity_rule") setSaveAsRule(true);
                    }}
                    className="mt-1 w-full border p-2 text-sm normal-case tracking-normal"
                    style={{ background: "#0B1C2D", borderColor: "var(--brand-steel)", color: "var(--brand-white)" }}
                  >
                    {BRAIN_INTENTS.map((option) => (
                      <option key={option} value={option}>{labelFor(option)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                  Priority
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as BrainPriority)}
                    className="mt-1 w-full border p-2 text-sm normal-case tracking-normal"
                    style={{ background: "#0B1C2D", borderColor: "var(--brand-steel)", color: "var(--brand-white)" }}
                  >
                    {BRAIN_PRIORITIES.map((option) => (
                      <option key={option} value={option}>{labelFor(option)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                  Category
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as ContinuityCategory)}
                    className="mt-1 w-full border p-2 text-sm normal-case tracking-normal"
                    style={{ background: "#0B1C2D", borderColor: "var(--brand-steel)", color: "var(--brand-white)" }}
                  >
                    {CONTINUITY_CATEGORIES.map((option) => (
                      <option key={option} value={option}>{labelFor(option)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--brand-gray)" }}>
                <input
                  type="checkbox"
                  checked={saveAsRule}
                  onChange={(event) => setSaveAsRule(event.target.checked)}
                />
                Save this as an active continuity rule for future generations.
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleSpeech}
                  className="border px-3 py-2 text-xs uppercase tracking-widest"
                  style={{
                    borderColor: listening ? "var(--brand-orange)" : "var(--brand-steel)",
                    color: listening ? "var(--brand-orange)" : "var(--brand-cyan)",
                  }}
                >
                  {listening ? "Stop Dictation" : "Dictate"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveFeedback()}
                  className="border px-3 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
                  style={{ borderColor: "var(--brand-orange)", color: "var(--brand-orange)" }}
                >
                  {saving ? "Saving..." : "Save Note"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveFeedback({ createRule: true, intent: "continuity_rule" })}
                  className="border px-3 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
                  style={{ borderColor: "rgba(34,197,94,0.55)", color: "#86efac" }}
                >
                  Save As Rule
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveFeedback({ intent: "regenerate", priority: "must_follow", action: "queue_regeneration" })}
                  className="border px-3 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
                  style={{ borderColor: "rgba(76,201,240,0.55)", color: "var(--brand-cyan)" }}
                >
                  Queue Regeneration
                </button>
              </div>

              {status && (
                <p className="mt-3 text-xs" style={{ color: status.includes("Could") || status.includes("not") ? "#fca5a5" : "var(--brand-cyan)" }}>
                  {status}
                </p>
              )}
            </div>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-widest">Active Continuity</h3>
                <button type="button" onClick={fetchBrain} className="text-xs" style={{ color: "var(--brand-cyan)" }}>
                  Refresh
                </button>
              </div>
              {listLoading ? (
                <p className="mt-3 text-sm" style={{ color: "var(--brand-gray)" }}>Loading brain context...</p>
              ) : listError ? (
                <p className="mt-3 text-sm text-red-300">{listError}</p>
              ) : continuity.length === 0 ? (
                <p className="mt-3 text-sm" style={{ color: "var(--brand-gray)" }}>
                  No active continuity rules for this context yet.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {continuity.slice(0, 8).map((rule) => (
                    <div key={rule.id} className="border p-3" style={{ borderColor: "var(--brand-steel)", background: "rgba(11,28,45,0.42)" }}>
                      <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                        {labelFor(rule.category)} · {labelFor(rule.strength)}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed">{rule.rule_text}</p>
                      <p className="mt-2 text-xs" style={{ color: "var(--brand-gray)" }}>{rule.scope_label}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-6 pb-10">
              <h3 className="text-sm font-semibold uppercase tracking-widest">Feedback Trail</h3>
              {feedback.length === 0 ? (
                <p className="mt-3 text-sm" style={{ color: "var(--brand-gray)" }}>
                  No notes yet for this context.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {feedback.map((item) => (
                    <div key={item.id} className="border p-3" style={{ borderColor: "var(--brand-steel)", background: "rgba(11,28,45,0.35)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>
                          {labelFor(item.intent)} · {labelFor(item.priority)} · {labelFor(item.status)}
                        </p>
                        {item.status === "open" && (
                          <button
                            type="button"
                            onClick={() => updateFeedbackStatus(item.id, "resolved")}
                            className="text-[10px] uppercase tracking-widest"
                            style={{ color: "var(--brand-orange)" }}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed">{item.body}</p>
                      <p className="mt-2 text-xs" style={{ color: "var(--brand-gray)" }}>
                        {item.target_label} · {new Date(item.created_at).toLocaleDateString()}
                        {item.transcript_source === "speech" ? " · dictated" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
