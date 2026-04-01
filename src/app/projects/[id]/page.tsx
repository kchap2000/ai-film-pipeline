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
        characters: data.characters,
        scenes: data.scenes,
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
                  <span className="text-xs" style={{ color: "var(--brand-gray)" }}>
                    {formatSize(file.file_size)}
                  </span>
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
        {[
          { show: hasExtracted, href: `/projects/${project.id}/bible`, label: "Film Bible", sub: "Characters, scenes, structure, and metadata extracted from your documents", section: "Film Bible" },
          { show: hasExtracted, href: `/projects/${project.id}/cast`, label: "Cast Characters", sub: "Generate 10 visual variations per character, then approve your cast", section: "AI Casting" },
          { show: phaseIndex >= 3, href: `/projects/${project.id}/lock`, label: "Lock Characters & Generate Poses", sub: "Generate front, 3/4, and profile reference poses for each cast character", section: "Character Lock & Reference Poses" },
          { show: phaseIndex >= 4, href: `/projects/${project.id}/locations`, label: "Location Bible", sub: "Generate visual references for each location, approve and lock into Scene Bible", section: "Location & Scene Bible" },
          { show: phaseIndex >= 5, href: `/projects/${project.id}/storyboard`, label: "Storyboard Generation", sub: "Shot-by-shot panel generation using locked characters and locations", section: "Storyboard" },
        ].map(({ show, href, label, sub, section }) =>
          show ? (
            <section key={section} className="mb-6">
              <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                {section}
              </h2>
              <Link href={href}>
                <div
                  className="rounded-xl p-6 transition-all duration-200 cursor-pointer"
                  style={{
                    background: "var(--brand-mid)",
                    border: "1px solid var(--brand-steel)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(255,138,42,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-steel)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
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
          ) : null
        )}
      </div>
    </div>
  );
}
