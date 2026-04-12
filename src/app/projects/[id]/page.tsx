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

  const fetchProject = async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data.project);
      setFiles(data.files || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProject();
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

        {/* Phase Links */}
        {(() => {
          // Determine which step is "next up" based on current phase
          const nextStep =
            phaseIndex === 1 ? "Film Bible" :
            phaseIndex === 2 ? "AI Casting" :
            phaseIndex === 3 ? "Character Lock" :
            phaseIndex === 4 ? "Location Scouting" :
            phaseIndex === 5 ? "Scene Scouting" :
            phaseIndex === 6 ? "Storyboard" : null;

          return [
            { show: hasExtracted,   href: `/projects/${project.id}/bible`,     label: "Film Bible",        sub: "Review and edit characters, scenes, structure, and metadata extracted from your documents" },
            { show: hasExtracted,   href: `/projects/${project.id}/cast`,      label: "AI Casting",        sub: "Generate visual variations per character, upload real headshots, and approve your cast" },
            { show: phaseIndex >= 3, href: `/projects/${project.id}/lock`,     label: "Character Lock",    sub: "Approve each character's headshot and auto-generate a multi-angle reference sheet" },
            { show: phaseIndex >= 4, href: `/projects/${project.id}/locations`, label: "Location Scouting", sub: "Generate visual references for each location, approve and lock into the scene bible" },
            { show: phaseIndex >= 5, href: `/projects/${project.id}/scenes`,   label: "Scene Scouting",    sub: "Generate atmospheric mood images for each scene — approve the best visual reference per scene" },
            { show: phaseIndex >= 5, href: `/projects/${project.id}/storyboard`, label: "Storyboard",      sub: "Shot-by-shot panel generation using locked characters, locations, and approved scene references" },
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
