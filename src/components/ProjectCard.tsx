"use client";

import { useState } from "react";
import Link from "next/link";
import { Project, PHASE_LABELS, PHASE_ORDER } from "@/lib/types";
import PhaseIndicator from "./PhaseIndicator";

function ProjectIcon({ type }: { type: string }) {
  if (type === "client") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h2M19 12h2M12 3v2M12 19v2" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

interface ProjectCardProps {
  project: Project;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

type MenuState = "closed" | "open" | "confirm-delete";

export default function ProjectCard({ project, onArchive, onUnarchive, onDelete }: ProjectCardProps) {
  const [menuState, setMenuState] = useState<MenuState>("closed");
  const [busy, setBusy] = useState(false);

  const date = new Date(project.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const currentIndex = PHASE_ORDER.indexOf(project.phase_status);
  const pct = Math.round(((currentIndex + 1) / PHASE_ORDER.length) * 100);
  const isComplete = project.phase_status === "storyboard";
  const isClient = project.type === "client";

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setMenuState("closed");
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !project.archived }),
      });
      if (project.archived) {
        onUnarchive?.(project.id);
      } else {
        onArchive?.(project.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setMenuState("closed");
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      onDelete?.(project.id);
    } finally {
      setBusy(false);
    }
  }

  function toggleMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuState((s) => (s === "closed" ? "open" : "closed"));
  }

  function openConfirmDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuState("confirm-delete");
  }

  function cancelMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuState("closed");
  }

  return (
    <div className="relative group h-full">
      {/* Clickable card body */}
      <Link href={`/projects/${project.id}`} tabIndex={menuState !== "closed" ? -1 : 0}>
        <div
          className="relative rounded-2xl p-6 transition-all duration-200 cursor-pointer h-full flex flex-col"
          style={{
            background: busy ? "var(--brand-steel)" : "var(--brand-mid)",
            border: "1px solid var(--brand-steel)",
            opacity: busy ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!busy) {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(255,138,42,0.12)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-steel)";
            (e.currentTarget as HTMLElement).style.boxShadow = "none";
          }}
        >
          {/* Top row — icon + type pill + menu trigger */}
          <div className="flex items-start justify-between mb-5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: isClient ? "rgba(76,201,240,0.12)" : "rgba(255,138,42,0.12)",
                border: isClient ? "1px solid rgba(76,201,240,0.25)" : "1px solid rgba(255,138,42,0.25)",
                color: isClient ? "var(--brand-cyan)" : "var(--brand-orange)",
              }}
            >
              <ProjectIcon type={project.type} />
            </div>

            <div className="flex items-center gap-2">
              <span
                className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: isClient ? "rgba(76,201,240,0.1)" : "rgba(255,138,42,0.1)",
                  color: isClient ? "var(--brand-cyan)" : "var(--brand-orange)",
                  border: isClient ? "1px solid rgba(76,201,240,0.2)" : "1px solid rgba(255,138,42,0.2)",
                }}
              >
                {project.type}
              </span>

              {/* ⋯ menu button — always rendered, visible on hover or when open */}
              <button
                onClick={toggleMenu}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100"
                style={{
                  background: menuState !== "closed" ? "rgba(255,138,42,0.15)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${menuState !== "closed" ? "rgba(255,138,42,0.3)" : "rgba(255,255,255,0.1)"}`,
                  color: menuState !== "closed" ? "var(--brand-orange)" : "var(--brand-gray)",
                  opacity: menuState !== "closed" ? 1 : undefined,
                }}
                aria-label="Project options"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Title */}
          <h3
            className="text-lg font-semibold leading-snug mb-1 transition-colors"
            style={{ color: "var(--brand-white)" }}
          >
            {project.title}
          </h3>
          <p className="text-xs mb-5" style={{ color: "var(--brand-gray)" }}>
            {project.type === "client" && project.client_name
              ? `Client: ${project.client_name}`
              : "Personal Project"}
          </p>

          {/* Phase + progress */}
          <div className="mt-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {isComplete ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5" style={{ color: "var(--brand-orange)" }}>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: "rgba(255,138,42,0.5)" }} />
                )}
                <p
                  className="text-xs font-medium"
                  style={{ color: isComplete ? "var(--brand-orange)" : "var(--brand-white)" }}
                >
                  {PHASE_LABELS[project.phase_status]}
                </p>
              </div>
              <span
                className="text-[11px] font-mono font-semibold"
                style={{ color: isComplete ? "var(--brand-orange)" : "var(--brand-gray)" }}
              >
                {pct}%
              </span>
            </div>
            <PhaseIndicator status={project.phase_status} />
          </div>

          {/* Date */}
          <p className="text-[10px] mt-4" style={{ color: "var(--brand-gray)", opacity: 0.7 }}>{date}</p>
        </div>
      </Link>

      {/* Dropdown menu — rendered outside Link to avoid nesting issues */}
      {menuState === "open" && (
        <div
          className="absolute right-2 top-14 z-50 rounded-xl overflow-hidden shadow-xl"
          style={{
            background: "#1A2B3C",
            border: "1px solid rgba(255,255,255,0.1)",
            minWidth: "160px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleArchive}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left transition-colors hover:bg-white/5"
            style={{ color: "var(--brand-gray)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
              {project.archived ? (
                <>
                  <path d="M3 9l1 11a2 2 0 002 2h12a2 2 0 002-2L21 9" />
                  <path d="M3 9h18M9 3h6l2 6H7L9 3z" />
                  <path d="M9 13l3 3 3-3" />
                </>
              ) : (
                <>
                  <path d="M3 9l1 11a2 2 0 002 2h12a2 2 0 002-2L21 9" />
                  <path d="M3 9h18M9 3h6l2 6H7L9 3z" />
                </>
              )}
            </svg>
            {project.archived ? "Unarchive" : "Archive"}
          </button>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 12px" }} />

          <button
            onClick={openConfirmDelete}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-left transition-colors hover:bg-red-500/10"
            style={{ color: "#f87171" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Delete
          </button>
        </div>
      )}

      {/* Inline delete confirmation */}
      {menuState === "confirm-delete" && (
        <div
          className="absolute inset-0 z-50 rounded-2xl flex flex-col items-center justify-center gap-4 p-6"
          style={{
            background: "rgba(11,28,45,0.97)",
            border: "1px solid rgba(248,113,113,0.4)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-5 h-5" style={{ color: "#f87171" }}>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--brand-white)" }}>Delete project?</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--brand-gray)" }}>
              All cast, scenes, storyboards, and images will be permanently removed.
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button
              onClick={cancelMenu}
              className="flex-1 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-white/5"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--brand-gray)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors"
              style={{ background: "#f87171", color: "#0B1C2D" }}
            >
              Delete Forever
            </button>
          </div>
        </div>
      )}

      {/* Click-away backdrop when menu is open */}
      {menuState !== "closed" && (
        <div
          className="fixed inset-0 z-40"
          onClick={cancelMenu}
        />
      )}
    </div>
  );
}
