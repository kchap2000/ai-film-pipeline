"use client";

import Link from "next/link";
import { Project, PHASE_LABELS, PHASE_ORDER } from "@/lib/types";
import PhaseIndicator from "./PhaseIndicator";

// Simple film-reel icon for the card badge
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
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2a10 10 0 0 1 0 20A10 10 0 0 1 12 2" />
      <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
    </svg>
  );
}

function PhaseIcon({ status }: { status: string }) {
  const isComplete = status === "storyboard";
  if (isComplete) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-amber-400">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-600/60 bg-transparent" />
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

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="group relative bg-neutral-900 border border-neutral-800 rounded-2xl p-6 transition-all duration-200 hover:border-amber-700/60 hover:bg-neutral-800/80 hover:shadow-lg hover:shadow-amber-900/10 cursor-pointer h-full flex flex-col">

        {/* Top row — icon badge + type pill */}
        <div className="flex items-start justify-between mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            project.type === "client"
              ? "bg-blue-900/40 text-blue-400 border border-blue-800/30"
              : "bg-amber-900/30 text-amber-500 border border-amber-800/30"
          }`}>
            <ProjectIcon type={project.type} />
          </div>
          <span className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full font-medium ${
            project.type === "client"
              ? "bg-blue-950/60 text-blue-400 border border-blue-800/40"
              : "bg-amber-950/60 text-amber-400 border border-amber-800/40"
          }`}>
            {project.type}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-neutral-100 group-hover:text-amber-300 transition-colors leading-snug mb-1">
          {project.title}
        </h3>
        <p className="text-xs text-neutral-500 mb-5">
          {project.type === "client" && project.client_name
            ? `Client: ${project.client_name}`
            : "Personal Project"}
        </p>

        {/* Phase + progress */}
        <div className="mt-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <PhaseIcon status={project.phase_status} />
              <p className={`text-xs font-medium ${isComplete ? "text-amber-400" : "text-neutral-300"}`}>
                {PHASE_LABELS[project.phase_status]}
              </p>
            </div>
            <span className={`text-[11px] font-mono font-semibold ${isComplete ? "text-amber-400" : "text-neutral-500"}`}>
              {pct}%
            </span>
          </div>
          <PhaseIndicator status={project.phase_status} />
        </div>

        {/* Date */}
        <p className="text-[10px] text-neutral-600 mt-4">{date}</p>
      </div>
    </Link>
  );
}
