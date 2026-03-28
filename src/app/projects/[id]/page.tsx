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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Extraction failed");
      }

      setExtractResult({
        characters: data.characters,
        scenes: data.scenes,
      });
      // Refresh project to get updated phase_status
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
      <div className="max-w-4xl mx-auto px-6 py-12 text-neutral-500 text-sm animate-pulse">
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-neutral-500">Project not found</p>
        <Link href="/" className="text-amber-500 text-xs mt-4 inline-block">
          &larr; Back to Dashboard
        </Link>
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
  const hasExtracted = phaseIndex >= 1; // past ingestion
  const canViewBible = phaseIndex >= 2; // at bible or later

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="border-b border-amber-900/25 pb-8 mb-10">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; Dashboard
        </Link>
        <div className="flex items-start justify-between mt-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
              {project.title}
            </h1>
            <p className="text-xs text-neutral-500 mt-2">
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
            className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${
              project.type === "client"
                ? "border-blue-800/50 text-blue-400 bg-blue-950/30"
                : "border-amber-800/50 text-amber-400 bg-amber-950/30"
            }`}
          >
            {project.type}
          </span>
        </div>
      </header>

      {/* Phase Status */}
      <section className="mb-10">
        <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
          Pipeline Status
        </h2>
        <div className="border border-neutral-800 p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-amber-400">
              {PHASE_LABELS[project.phase_status]}
            </span>
            <span className="text-[10px] text-neutral-600 uppercase tracking-widest">
              Phase{" "}
              {PHASE_ORDER.indexOf(project.phase_status) + 1} of 7
            </span>
          </div>
          <PhaseIndicator status={project.phase_status} />
        </div>
      </section>

      {/* File Upload */}
      <section className="mb-10">
        <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
          Project Documents
        </h2>

        {files.length > 0 && (
          <div className="border border-neutral-800 divide-y divide-neutral-800 mb-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-600 border border-neutral-700 px-2 py-0.5">
                    {fileTypeLabel(file.file_type)}
                  </span>
                  <span className="text-sm text-neutral-300">
                    {file.file_name}
                  </span>
                </div>
                <span className="text-xs text-neutral-600">
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
        <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
          LLM Extraction
        </h2>
        <div className="border border-neutral-800 p-6">
          {extracting ? (
            <div className="text-center">
              <div className="text-amber-500 text-sm animate-pulse mb-2">
                Running extraction via Claude...
              </div>
              <p className="text-neutral-600 text-xs">
                Analyzing documents for characters, scenes, and structure. This
                may take 30-60 seconds.
              </p>
            </div>
          ) : extractResult ? (
            <div className="text-center">
              <p className="text-green-400 text-sm mb-2">
                Extraction complete
              </p>
              <p className="text-neutral-400 text-xs">
                Found {extractResult.characters} characters and{" "}
                {extractResult.scenes} scenes
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-300">
                  {hasExtracted
                    ? "Extraction has been run. You can re-extract to update."
                    : "Extract characters, scenes, and structure from uploaded documents."}
                </p>
                {!canExtract && (
                  <p className="text-xs text-neutral-600 mt-1">
                    Upload at least one document first.
                  </p>
                )}
              </div>
              <button
                onClick={runExtraction}
                disabled={!canExtract}
                className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {hasExtracted ? "Re-Extract" : "Run Extraction"}
              </button>
            </div>
          )}

          {extractError && (
            <p className="text-red-400 text-xs border border-red-900/50 bg-red-950/20 px-4 py-3 mt-4">
              {extractError}
            </p>
          )}
        </div>
      </section>

      {/* Film Bible Link */}
      {hasExtracted && (
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
            Film Bible
          </h2>
          <Link
            href={`/projects/${project.id}/bible`}
            className="block border border-neutral-800 p-6 hover:border-amber-800 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-300 group-hover:text-amber-400 transition-colors">
                  View Film Bible
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Characters, scenes, structure, and metadata extracted from your
                  documents
                </p>
              </div>
              <span className="text-amber-600 text-lg">&rarr;</span>
            </div>
          </Link>
        </section>
      )}

      {/* AI Casting Link */}
      {hasExtracted && (
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
            AI Casting
          </h2>
          <Link
            href={`/projects/${project.id}/cast`}
            className="block border border-neutral-800 p-6 hover:border-amber-800 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-300 group-hover:text-amber-400 transition-colors">
                  Cast Characters
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Generate 10 visual variations per character, then approve your cast
                </p>
              </div>
              <span className="text-amber-600 text-lg">&rarr;</span>
            </div>
          </Link>
        </section>
      )}

      {/* Character Lock Link */}
      {phaseIndex >= 3 && (
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
            Character Lock & Reference Poses
          </h2>
          <Link
            href={`/projects/${project.id}/lock`}
            className="block border border-neutral-800 p-6 hover:border-amber-800 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-300 group-hover:text-amber-400 transition-colors">
                  Lock Characters & Generate Poses
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Generate front, 3/4, and profile reference poses for each cast character
                </p>
              </div>
              <span className="text-amber-600 text-lg">&rarr;</span>
            </div>
          </Link>
        </section>
      )}

      {/* Location & Scene Bible Link */}
      {phaseIndex >= 4 && (
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
            Location & Scene Bible
          </h2>
          <Link
            href={`/projects/${project.id}/locations`}
            className="block border border-neutral-800 p-6 hover:border-amber-800 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-300 group-hover:text-amber-400 transition-colors">
                  Location Bible
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Generate visual references for each location, approve and lock into Scene Bible
                </p>
              </div>
              <span className="text-amber-600 text-lg">&rarr;</span>
            </div>
          </Link>
        </section>
      )}

      {/* Storyboard Link */}
      {phaseIndex >= 5 && (
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
            Storyboard
          </h2>
          <Link
            href={`/projects/${project.id}/storyboard`}
            className="block border border-neutral-800 p-6 hover:border-amber-800 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-300 group-hover:text-amber-400 transition-colors">
                  Storyboard Generation
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Shot-by-shot panel generation using locked characters and locations
                </p>
              </div>
              <span className="text-amber-600 text-lg">&rarr;</span>
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}
