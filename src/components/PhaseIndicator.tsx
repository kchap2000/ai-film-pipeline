"use client";

import { PhaseStatus, PHASE_ORDER } from "@/lib/types";

export default function PhaseIndicator({ status }: { status: PhaseStatus }) {
  const currentIndex = PHASE_ORDER.indexOf(status);
  const pct = Math.round(((currentIndex + 1) / PHASE_ORDER.length) * 100);
  const isComplete = status === "storyboard";

  return (
    <div className="w-full">
      {/* Bar */}
      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isComplete
              ? "linear-gradient(90deg, #d97706, #f59e0b, #fcd34d)"
              : "linear-gradient(90deg, #92400e, #d97706, #f59e0b)",
          }}
        />
      </div>
    </div>
  );
}
