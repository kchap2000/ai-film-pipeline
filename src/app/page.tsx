"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Project } from "@/lib/types";
import ProjectCard from "@/components/ProjectCard";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function loadArchived() {
    if (archivedProjects.length > 0) return; // already loaded
    setLoadingArchived(true);
    try {
      const res = await fetch("/api/projects?archived=true");
      const data = await res.json();
      setArchivedProjects(Array.isArray(data) ? data : []);
    } finally {
      setLoadingArchived(false);
    }
  }

  function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    if (next) loadArchived();
  }

  function handleArchive(id: string) {
    // Move project from active list to archived list
    const p = projects.find((x) => x.id === id);
    if (p) {
      setProjects((prev) => prev.filter((x) => x.id !== id));
      setArchivedProjects((prev) => [{ ...p, archived: true }, ...prev]);
    }
  }

  function handleUnarchive(id: string) {
    // Move project from archived list back to active list
    const p = archivedProjects.find((x) => x.id === id);
    if (p) {
      setArchivedProjects((prev) => prev.filter((x) => x.id !== id));
      setProjects((prev) => [{ ...p, archived: false }, ...prev]);
    }
  }

  function handleDelete(id: string) {
    setProjects((prev) => prev.filter((x) => x.id !== id));
    setArchivedProjects((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.3em] mb-3 flex items-center gap-2"
             style={{ color: "var(--brand-orange)", opacity: 0.8 }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--brand-orange)" }} />
            Production System V2.0
          </p>
          <div className="flex items-end justify-between">
            <h1 className="text-5xl font-black tracking-tight leading-none" style={{ color: "var(--brand-white)" }}>
              Pipeline{" "}
              <span className="font-extralight" style={{ color: "var(--brand-gray)" }}>Overview</span>
            </h1>
            <Link
              href="/projects/new"
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-5 py-3 rounded-xl transition-all duration-150 hover:opacity-90 hover:shadow-lg"
              style={{
                background: "var(--brand-orange)",
                color: "#0B1C2D",
                boxShadow: "0 0 0 0 transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 8px 24px rgba(255,138,42,0.25)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 0 0 transparent")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create Project
            </Link>
          </div>
        </header>

        {/* Active projects grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl p-6 h-52 animate-pulse"
                   style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            ))}

            {/* Add New Project card */}
            <Link href="/projects/new">
              <div
                className="group rounded-2xl p-6 h-full min-h-[200px] flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer"
                style={{
                  border: "2px dashed var(--brand-steel)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-steel)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                     style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                       className="w-5 h-5 group-hover:opacity-100 transition-opacity"
                       style={{ color: "var(--brand-gray)" }}>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <p className="text-sm font-medium transition-colors" style={{ color: "var(--brand-gray)" }}>
                  Add New Project
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* Archived section */}
        <div className="mt-12">
          <button
            onClick={toggleArchived}
            className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest transition-colors hover:opacity-80"
            style={{ color: "var(--brand-gray)" }}
          >
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              className="w-4 h-4 transition-transform duration-200"
              style={{ transform: showArchived ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4">
              <path d="M3 9l1 11a2 2 0 002 2h12a2 2 0 002-2L21 9" />
              <path d="M3 9h18M9 3h6l2 6H7L9 3z" />
            </svg>
            Archived
            {archivedProjects.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono"
                    style={{ background: "rgba(255,255,255,0.08)", color: "var(--brand-gray)" }}>
                {archivedProjects.length}
              </span>
            )}
          </button>

          {showArchived && (
            <div className="mt-5">
              {loadingArchived ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="rounded-2xl p-6 h-40 animate-pulse"
                         style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)", opacity: 0.5 }} />
                  ))}
                </div>
              ) : archivedProjects.length === 0 ? (
                <p className="text-sm mt-3" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                  No archived projects.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ opacity: 0.65 }}>
                  {archivedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onUnarchive={handleUnarchive}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-6 flex items-center justify-between"
                style={{ borderTop: "1px solid var(--brand-steel)" }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: "rgba(255,138,42,0.15)", border: "1px solid rgba(255,138,42,0.25)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                   className="w-4 h-4" style={{ color: "var(--brand-orange)" }}>
                <rect x="2" y="2" width="20" height="20" rx="3" />
                <path d="M7 2v20M17 2v20M2 7h5M17 7h5M2 12h20M2 17h5M17 17h5" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--brand-white)" }}>AI Film Production</p>
              <p className="text-[10px] flex items-center gap-1.5 mt-0.5" style={{ color: "var(--brand-gray)" }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#4ade80" }} />
                System Status: Operational
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3 h-3">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Charleston, SC
            </span>
            <span className="font-medium" style={{ color: "var(--brand-orange)" }}>Khalil Chapman</span>
            {/* Sign out — hidden until Google Auth is wired up */}
          </div>
        </footer>
      </div>
    </div>
  );
}
