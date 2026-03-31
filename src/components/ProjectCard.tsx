"use client";

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

export default function ProjectCard({ project }: { project: Project }) {
  const date = new Date(project.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const currentIndex = PHASE_ORDER.indexOf(project.phase_status);
  const pct = Math.round(((currentIndex + 1) / PHASE_ORDER.length) * 100);
  const isComplete = project.phase_status === "storyboard";
  const isClient = project.type === "client";

  return (
    <Link href={`/projects/${project.id}`}>
      <div
        className="group relative rounded-2xl p-6 transition-all duration-200 cursor-pointer h-full flex flex-col"
        style={{
          background: "var(--brand-mid)",
          border: "1px solid var(--brand-steel)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(255,138,42,0.12)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-steel)";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
      >
        {/* Top row — icon + type pill */}
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
  );
}
