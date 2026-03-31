"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PhaseStatus, PHASE_ORDER, PHASE_LABELS } from "@/lib/types";

const PHASE_PATHS: Record<PhaseStatus, string | null> = {
  ingestion: null,
  extraction: null,
  bible: "bible",
  casting: "cast",
  lock: "lock",
  scene_bible: "locations",
  storyboard: "storyboard",
};

interface ProjectNavProps {
  projectId: string;
  currentPhase?: PhaseStatus;
}

export default function ProjectNav({ projectId, currentPhase: phaseProp }: ProjectNavProps) {
  const pathname = usePathname();
  const [currentPhase, setCurrentPhase] = useState<PhaseStatus | null>(phaseProp ?? null);

  useEffect(() => {
    if (!phaseProp) {
      fetch(`/api/projects/${projectId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.project?.phase_status) setCurrentPhase(d.project.phase_status);
          else if (d?.phase_status) setCurrentPhase(d.phase_status);
        })
        .catch(() => {});
    }
  }, [projectId, phaseProp]);

  const currentPhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : 0;

  return (
    <nav
      className="border-b backdrop-blur-sm sticky top-0 z-10"
      style={{
        background: "rgba(11,28,45,0.95)",
        borderColor: "var(--brand-steel)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center overflow-x-auto">
          {PHASE_ORDER.map((phase, idx) => {
            const path = PHASE_PATHS[phase];
            const href = path ? `/projects/${projectId}/${path}` : `/projects/${projectId}`;
            const isActive = path
              ? pathname.endsWith(`/${path}`)
              : pathname === `/projects/${projectId}`;
            const isUnlocked = idx <= currentPhaseIndex;
            const isComplete = idx < currentPhaseIndex;

            return (
              <div key={phase} className="flex items-center flex-shrink-0">
                {isUnlocked ? (
                  <Link
                    href={href}
                    className="flex items-center gap-2 px-4 py-3.5 text-[10px] uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap"
                    style={{
                      borderBottomColor: isActive ? "var(--brand-orange)" : "transparent",
                      color: isActive
                        ? "var(--brand-orange)"
                        : isComplete
                        ? "var(--brand-gray)"
                        : "rgba(255,138,42,0.55)",
                    }}
                  >
                    {isComplete && !isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    )}
                    <span className="mr-0.5" style={{ color: "var(--brand-steel)" }}>
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {PHASE_LABELS[phase]}
                  </Link>
                ) : (
                  <span
                    className="flex items-center gap-2 px-4 py-3.5 text-[10px] uppercase tracking-widest border-b-2 border-transparent whitespace-nowrap cursor-not-allowed"
                    style={{ color: "rgba(44,79,115,0.45)" }}
                  >
                    <span className="mr-0.5" style={{ color: "rgba(44,79,115,0.25)" }}>
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {PHASE_LABELS[phase]}
                  </span>
                )}
                {idx < PHASE_ORDER.length - 1 && (
                  <span
                    className="text-[10px] px-0.5 flex-shrink-0"
                    style={{ color: "var(--brand-steel)" }}
                  >
                    ›
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
