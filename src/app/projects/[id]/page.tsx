"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Project, ProjectFile, PHASE_LABELS, PHASE_ORDER } from "@/lib/types";
import PhaseIndicator from "@/components/PhaseIndicator";
import FileUpload from "@/components/FileUpload";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<{
    characters: number;
    scenes: number;
  } | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [readiness, setReadiness] = useState<{
    ready_for_first_frames: boolean;
    total_panels: number;
    checks: {
      characters_locked: { done: number; total: number; ok: boolean };
      locations_approved: { done: number; total: number; ok: boolean };
      scenes_scouted: { done: number; total: number; ok: boolean };
      scenes_have_panels: { done: number; total: number; ok: boolean };
    };
  } | null>(null);

  const fetchProject = async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data.project);
      setFiles(data.files || []);
      setNotes(data.project?.production_notes || "");
      setNotesDirty(false);
    }
    setLoading(false);
  };

  const saveNotes = async () => {
    if (!notesDirty || savingNotes) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_notes: notes }),
      });
      if (res.ok) {
        setNotesDirty(false);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
      }
    } finally {
      setSavingNotes(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [id]);

  // Load pipeline readiness once the project loads; shown as a compact tile
  // so Khalil can see what's blocking the next phase without visiting each
  // phase page. Silently no-ops if the endpoint 404s (old projects).
  useEffect(() => {
    fetch(`/api/projects/${id}/readiness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.checks) setReadiness(d);
      })
      .catch(() => {});
  }, [id]);

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    setExtractResult(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });

      // Guard against Vercel returning HTML on timeout/crash instead of JSON
      let data: { error?: string; characters?: number; scenes?: number } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 504 || res.status === 502
            ? "Extraction timed out — your document may be very large. Try a shorter script or split it into sections."
            : `Server error (${res.status}). Please try again.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "Extraction failed");
      }

      setExtractResult({
        characters: data.characters ?? 0,
        scenes: data.scenes ?? 0,
      });
      await fetchProject();
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Extraction failed"
      );
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p style={{ color: "var(--brand-gray)" }}>Project not found</p>
          <Link href="/" className="text-xs mt-4 inline-block" style={{ color: "var(--brand-orange)" }}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const deleteFile = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      await fetch(`/api/projects/${id}/files?file_id=${fileId}`, {
        method: "DELETE",
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } finally {
      setDeletingFileId(null);
    }
  };

  const fileTypeLabel = (mimeType: string) => {
    if (mimeType === "application/pdf") return "PDF";
    if (mimeType.includes("wordprocessingml")) return "DOCX";
    if (mimeType === "text/plain") return "TXT";
    return "FILE";
  };

  const phaseIndex = PHASE_ORDER.indexOf(project.phase_status);
  const canExtract = files.length > 0;
  const hasExtracted = phaseIndex >= 1;
  const isClient = project.type === "client";

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="pb-8 mb-10" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.25em] transition-colors"
            style={{ color: "var(--brand-orange)" }}
          >
            &larr; Dashboard
          </Link>
          <div className="flex items-start justify-between mt-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                {project.title}
              </h1>
              <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                {project.type === "client" && project.client_name
                  ? `Client: ${project.client_name}`
                  : "Personal Project"}
                {" · "}
                {new Date(project.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <span
              className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full"
              style={{
                background: isClient ? "rgba(76,201,240,0.1)" : "rgba(255,138,42,0.1)",
                color: isClient ? "var(--brand-cyan)" : "var(--brand-orange)",
                border: isClient ? "1px solid rgba(76,201,240,0.2)" : "1px solid rgba(255,138,42,0.2)",
              }}
            >
              {project.type}
            </span>
          </div>
        </header>

        {/* Phase Status */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Pipeline Status
          </h2>
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: "var(--brand-orange)" }}>
                {PHASE_LABELS[project.phase_status]}
              </span>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                Phase {PHASE_ORDER.indexOf(project.phase_status) + 1} of 7
              </span>
            </div>
            <PhaseIndicator status={project.phase_status} />
          </div>
        </section>

        {/* File Upload */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Project Documents
          </h2>

          {files.length > 0 && (
            <div
              className="mb-4 rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--brand-steel)" }}
            >
              {files.map((file, i) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--brand-steel)" : "none",
                    background: "var(--brand-mid)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{
                        color: "var(--brand-gray)",
                        border: "1px solid var(--brand-steel)",
                      }}
                    >
                      {fileTypeLabel(file.file_type)}
                    </span>
                    <span className="text-sm" style={{ color: "var(--brand-white)" }}>
                      {file.file_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--brand-gray)" }}>
                      {formatSize(file.file_size)}
                    </span>
                    <button
                      onClick={() => deleteFile(file.id)}
                      disabled={deletingFileId === file.id}
                      className="w-6 h-6 flex items-center justify-center rounded transition-colors disabled:opacity-40"
                      style={{ color: "var(--brand-gray)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "#f87171";
                        (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "var(--brand-gray)";
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                      title="Remove file"
                    >
                      {deletingFileId === file.id ? (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <FileUpload projectId={project.id} onUploadComplete={fetchProject} />
        </section>

        {/* Extraction */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            LLM Extraction
          </h2>
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            {extracting ? (
              <div className="text-center">
                <div className="text-sm animate-pulse mb-2" style={{ color: "var(--brand-orange)" }}>
                  Running extraction via Claude...
                </div>
                <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                  Analyzing documents for characters, scenes, and structure. This may take 30-60 seconds.
                </p>
              </div>
            ) : extractResult ? (
              <div className="text-center">
                <p className="text-green-400 text-sm mb-2">Extraction complete</p>
                <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                  Found {extractResult.characters} characters and {extractResult.scenes} scenes
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: "var(--brand-white)" }}>
                    {hasExtracted
                      ? "Extraction has been run. You can re-extract to update."
                      : "Extract characters, scenes, and structure from uploaded documents."}
                  </p>
                  {!canExtract && (
                    <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                      Upload at least one document first.
                    </p>
                  )}
                </div>
                <button
                  onClick={runExtraction}
                  disabled={!canExtract}
                  className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                  style={{
                    color: "var(--brand-orange)",
                    border: "1px solid rgba(255,138,42,0.4)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {hasExtracted ? "Re-Extract" : "Run Extraction"}
                </button>
              </div>
            )}

            {extractError && (
              <p className="text-red-400 text-xs px-4 py-3 mt-4" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                {extractError}
              </p>
            )}
          </div>
        </section>

        {/* Production Notes — director-level style/continuity directive,
            injected into all downstream generation prompts. */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Production Notes
          </h2>
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            <p className="text-xs mb-3" style={{ color: "var(--brand-gray)" }}>
              Any text here is prepended as a locked directive to storyboard, scene-scout, and
              location-scout image prompts. Use it for overrides like &ldquo;all scenes at night&rdquo;,
              &ldquo;2.39:1 anamorphic aspect&rdquo;, or &ldquo;character X always wears a red coat&rdquo;.
            </p>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesDirty(true);
                setNotesSaved(false);
              }}
              onBlur={saveNotes}
              rows={5}
              placeholder="e.g. All scenes shot at night. Cool blue/teal color grade throughout. 2.39:1 anamorphic aspect. Always render Rob in a charcoal peacoat."
              className="w-full text-sm px-3 py-2 rounded-md outline-none resize-y"
              style={{
                background: "var(--brand-navy)",
                color: "var(--brand-white)",
                border: "1px solid var(--brand-steel)",
                minHeight: 96,
              }}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                {savingNotes
                  ? "Saving..."
                  : notesDirty
                  ? "Unsaved — click outside or Save to persist"
                  : notesSaved
                  ? "Saved"
                  : notes
                  ? "Saved"
                  : "Empty"}
              </span>
              <button
                onClick={saveNotes}
                disabled={!notesDirty || savingNotes}
                className="text-xs uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "var(--brand-orange)",
                  border: "1px solid rgba(255,138,42,0.4)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Save
              </button>
            </div>
          </div>
        </section>

        {/* Pipeline Readiness — only show once casting has begun, and
            only for projects past the extraction phase. Gives Khalil an
            at-a-glance view of what's blocking First Frames. */}
        {readiness && phaseIndex >= 3 && (
          <section className="mb-10">
            <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Pipeline Readiness
            </h2>
            <div
              className="rounded-xl p-5"
              style={{
                background: readiness.ready_for_first_frames
                  ? "rgba(34,197,94,0.05)"
                  : "var(--brand-mid)",
                border: readiness.ready_for_first_frames
                  ? "1px solid rgba(34,197,94,0.35)"
                  : "1px solid var(--brand-steel)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-xs font-medium"
                  style={{
                    color: readiness.ready_for_first_frames ? "#4ade80" : "var(--brand-white)",
                  }}
                >
                  {readiness.ready_for_first_frames
                    ? "Ready to generate First Frames"
                    : "Not yet ready for First Frames"}
                </span>
                {readiness.ready_for_first_frames && (
                  <Link
                    href={`/projects/${id}/first-frames`}
                    className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-3 py-1.5 hover:bg-green-950/30 transition-colors"
                  >
                    Go to First Frames &rarr;
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Characters Locked", c: readiness.checks.characters_locked },
                  { label: "Locations Approved", c: readiness.checks.locations_approved },
                  { label: "Scenes Scouted", c: readiness.checks.scenes_scouted },
                  { label: "Scenes Have Panels", c: readiness.checks.scenes_have_panels },
                ].map(({ label, c }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2 rounded"
                    style={{
                      background: c.ok ? "rgba(34,197,94,0.06)" : "var(--brand-navy)",
                      border: c.ok ? "1px solid rgba(34,197,94,0.25)" : "1px solid var(--brand-steel)",
                    }}
                  >
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      {label}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: c.ok ? "#4ade80" : "var(--brand-gray)" }}
                    >
                      {c.done}/{c.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Phase Links */}
        {(() => {
          // Determine which step is "next up" based on current phase
          const nextStep =
            phaseIndex === 1 ? "Film Bible" :
            phaseIndex === 2 ? "AI Casting" :
            phaseIndex === 3 ? "Character Lock" :
            phaseIndex === 4 ? "Location Scouting" :
            phaseIndex === 5 ? "Scene Scouting" :
            phaseIndex === 6 ? "Storyboard" :
            phaseIndex === 7 ? "First Frames" : null;

          return [
            { show: hasExtracted,   href: `/projects/${project.id}/bible`,     label: "Film Bible",        sub: "Review and edit characters, scenes, structure, and metadata extracted from your documents" },
            { show: hasExtracted,   href: `/projects/${project.id}/cast`,      label: "AI Casting",        sub: "Generate visual variations per character, upload real headshots, and approve your cast" },
            { show: phaseIndex >= 3, href: `/projects/${project.id}/lock`,     label: "Character Lock",    sub: "Approve each character's headshot and auto-generate a multi-angle reference sheet" },
            { show: phaseIndex >= 4, href: `/projects/${project.id}/locations`, label: "Location Scouting", sub: "Generate visual references for each location, approve and lock into the scene bible" },
            { show: phaseIndex >= 5, href: `/projects/${project.id}/scenes`,   label: "Scene Scouting",    sub: "Generate atmospheric mood images for each scene — approve the best visual reference per scene" },
            { show: phaseIndex >= 5, href: `/projects/${project.id}/storyboard`, label: "Storyboard",      sub: "Shot-by-shot panel generation using locked characters, locations, and approved scene references" },
            { show: phaseIndex >= 6, href: `/projects/${project.id}/first-frames`, label: "First Frames",  sub: "Photorealistic shoot-day reference frames — identity-locked to approved headshots and scene scouts" },
          ].map(({ show, href, label, sub }) => {
            if (!show) return null;
            const isNextUp = label === nextStep;
            return (
              <section key={label} className="mb-4">
                {isNextUp && (
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: "rgba(255,138,42,0.15)", color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.35)" }}
                    >
                      Next Up
                    </span>
                  </div>
                )}
                <Link href={href}>
                  <div
                    className="rounded-xl p-6 transition-all duration-200 cursor-pointer"
                    style={{
                      background: isNextUp ? "rgba(255,138,42,0.06)" : "var(--brand-mid)",
                      border: isNextUp ? "1px solid rgba(255,138,42,0.5)" : "1px solid var(--brand-steel)",
                      boxShadow: isNextUp ? "0 4px 24px rgba(255,138,42,0.08)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(255,138,42,0.12)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = isNextUp ? "rgba(255,138,42,0.5)" : "var(--brand-steel)";
                      (e.currentTarget as HTMLElement).style.boxShadow = isNextUp ? "0 4px 24px rgba(255,138,42,0.08)" : "none";
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: isNextUp ? "var(--brand-orange)" : "var(--brand-white)" }}>
                          {label}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                          {sub}
                        </p>
                      </div>
                      <span className="text-lg ml-4" style={{ color: "var(--brand-orange)" }}>&rarr;</span>
                    </div>
                  </div>
                </Link>
              </section>
            );
          });
        })()}
      </div>
    </div>
  );
}
