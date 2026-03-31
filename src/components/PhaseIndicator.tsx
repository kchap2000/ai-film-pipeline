"use client";

import { PhaseStatus, PHASE_ORDER } from "@/lib/types";

export default function PhaseIndicator({ status }: { status: PhaseStatus }) {
  const currentIndex = PHASE_ORDER.indexOf(status);
  const pct = Math.round(((currentIndex + 1) / PHASE_ORDER.length) * 100);
  const isComplete = status === "storyboard";

  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(44,79,115,0.5)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isComplete
              ? "linear-gradient(90deg, #FF8A2A, #FFB25C, #FF8A2A)"
              : "linear-gradient(90deg, #FF8A2A80, #FF8A2A, #FFB25C)",
          }}
        />
      </div>
    </div>
  );
}
