"use client";

import { PhaseStatus, PHASE_ORDER, PHASE_LABELS } from "@/lib/types";

export default function PhaseIndicator({ status }: { status: PhaseStatus }) {
  const currentIndex = PHASE_ORDER.indexOf(status);

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase, i) => {
        const isActive = i === currentIndex;
        const isCompleted = i < currentIndex;

        return (
          <div key={phase} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full transition-colors ${
                isActive
                  ? "bg-amber-500"
                  : isCompleted
                  ? "bg-amber-700"
                  : "bg-neutral-700"
              }`}
              title={PHASE_LABELS[phase]}
            />
            {i < PHASE_ORDER.length - 1 && (
              <div
                className={`h-px w-3 ${
                  isCompleted ? "bg-amber-700" : "bg-neutral-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
