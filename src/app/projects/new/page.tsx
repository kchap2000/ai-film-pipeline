"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DEFAULT_NEW_PROJECT_ASPECT_RATIO,
  PROJECT_ASPECT_RATIO_OPTIONS,
  type ProjectAspectRatio,
  type ProjectMode,
  type ProjectType,
} from "@/lib/types";

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ProjectType>("personal");
  const [mode, setMode] = useState<ProjectMode>("manual");
  const [aspectRatio, setAspectRatio] = useState<ProjectAspectRatio>(
    DEFAULT_NEW_PROJECT_ASPECT_RATIO
  );
  const [clientName, setClientName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          mode,
          aspect_ratio: aspectRatio,
          client_name: type === "client" ? clientName.trim() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }

      const project = await res.json();
      // Auto mode skips straight to the pipeline control room — upload the
      // script there, hit Start, and the orchestrator runs everything.
      router.push(mode === "auto" ? `/projects/${project.id}` : `/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="pb-8 mb-10" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.25em] transition-colors"
            style={{ color: "var(--brand-orange)" }}
          >
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-4" style={{ color: "var(--brand-white)" }}>
            New Project
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Title */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>
              Project Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Last Signal — Episode 1"
              className="w-full px-4 py-3 text-sm transition-colors focus:outline-none"
              style={{
                background: "var(--brand-mid)",
                border: "1px solid var(--brand-steel)",
                color: "var(--brand-white)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-orange)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Project Type
            </label>
            <div className="flex gap-3">
              {(["personal", "client"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex-1 px-4 py-3 text-xs uppercase tracking-widest transition-colors"
                  style={{
                    border: type === t
                      ? "1px solid var(--brand-orange)"
                      : "1px solid var(--brand-steel)",
                    color: type === t ? "var(--brand-orange)" : "var(--brand-gray)",
                    background: type === t ? "rgba(255,138,42,0.08)" : "transparent",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Client Name (conditional) */}
          {type === "client" && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Netflix, A24, Independent"
                className="w-full px-4 py-3 text-sm transition-colors focus:outline-none"
                style={{
                  background: "var(--brand-mid)",
                  border: "1px solid var(--brand-steel)",
                  color: "var(--brand-white)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-orange)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
              />
            </div>
          )}

          {/* Production Mode — the FINAL VISION two-mode split */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Production Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: "manual" as const, label: "Manual — You Direct", desc: "Pipeline pauses at every gate. Approve casting, locations, scenes, and shots yourself — with the Director's Chat agent on every page." },
                { value: "auto" as const, label: "Auto — Script → Video", desc: "Zero intervention. AI selects the best option at every gate and runs all 12 phases to a finished video + QA report." },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className="text-left px-4 py-3 transition-colors"
                  style={{
                    border: mode === option.value ? "1px solid var(--brand-orange)" : "1px solid var(--brand-steel)",
                    background: mode === option.value ? "rgba(255,138,42,0.08)" : "var(--brand-mid)",
                  }}
                >
                  <span className="block text-xs font-semibold" style={{ color: mode === option.value ? "var(--brand-orange)" : "var(--brand-white)" }}>
                    {option.label}
                  </span>
                  <span className="block text-[11px] mt-1 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                    {option.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Delivery Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROJECT_ASPECT_RATIO_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAspectRatio(option.value)}
                  className="text-left px-4 py-3 transition-colors"
                  style={{
                    border:
                      aspectRatio === option.value
                        ? "1px solid var(--brand-orange)"
                        : "1px solid var(--brand-steel)",
                    background:
                      aspectRatio === option.value
                        ? "rgba(255,138,42,0.08)"
                        : "var(--brand-mid)",
                  }}
                >
                  <span
                    className="block text-xs font-semibold"
                    style={{ color: aspectRatio === option.value ? "var(--brand-orange)" : "var(--brand-white)" }}
                  >
                    {option.label}
                  </span>
                  <span className="block text-[11px] mt-1 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
              This controls scene scouts, storyboard panels, and first frames so generated assets match the final edit.
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs px-4 py-3" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full px-6 py-3 text-xs uppercase tracking-widest transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--brand-orange)",
              color: "#0B1C2D",
              fontWeight: 700,
            }}
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </form>
      </div>
    </div>
  );
}
