"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PhaseStatus, PHASE_ORDER } from "@/lib/types";

// Each nav step: a phase enum value OR a custom step that slots between phases
const NAV_STEPS: Array<
  | { type: "phase"; phase: PhaseStatus; label: string; path: string | null }
  | { type: "custom"; key: string; label: string; path: string; unlockedAfter: number }
> = [
  { type: "phase", phase: "ingestion",   label: "Project",         path: null },
  { type: "phase", phase: "extraction",  label: "Extraction",      path: null },
  { type: "phase", phase: "bible",       label: "Film Bible",      path: "bible" },
  { type: "phase", phase: "casting",     label: "AI Casting",      path: "cast" },
  { type: "phase", phase: "lock",        label: "Character Lock",  path: "lock" },
  { type: "phase", phase: "scene_bible", label: "Locations",       path: "locations" },
  // Scene Scouting: custom step, unlocks after index 4 (lock phase)
  { type: "custom", key: "scenes", label: "Scene Scout", path: "scenes", unlockedAfter: 4 },
  { type: "phase", phase: "storyboard",  label: "Storyboard",      path: "storyboard" },
];

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
          {NAV_STEPS.map((step, idx) => {
            // Determine the href and whether this step is active / unlocked
            const path = step.path;
            const href = path ? `/projects/${projectId}/${path}` : `/projects/${projectId}`;
            const isActive = path
              ? pathname.endsWith(`/${path}`)
              : pathname === `/projects/${projectId}`;

            let isUnlocked: boolean;
            let isComplete: boolean;

            if (step.type === "phase") {
              const stepIndex = PHASE_ORDER.indexOf(step.phase);
              isUnlocked = stepIndex <= currentPhaseIndex;
              isComplete = stepIndex < currentPhaseIndex;
            } else {
              // Custom step: unlocked after the specified phase index
              isUnlocked = currentPhaseIndex > step.unlockedAfter;
              isComplete = false; // custom steps don't have their own phase completion signal
            }

            // Compute a display number — sequential across all steps
            const displayNum = String(idx + 1).padStart(2, "0");

            return (
              <div key={step.type === "phase" ? step.phase : step.key} className="flex items-center flex-shrink-0">
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
                      {displayNum}
                    </span>
                    {step.label}
                  </Link>
                ) : (
                  <span
                    className="flex items-center gap-2 px-4 py-3.5 text-[10px] uppercase tracking-widest border-b-2 border-transparent whitespace-nowrap cursor-not-allowed"
                    style={{ color: "rgba(44,79,115,0.45)" }}
                  >
                    <span className="mr-0.5" style={{ color: "rgba(44,79,115,0.25)" }}>
                      {displayNum}
                    </span>
                    {step.label}
                  </span>
                )}
                {idx < NAV_STEPS.length - 1 && (
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
