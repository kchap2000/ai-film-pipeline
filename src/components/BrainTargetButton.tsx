"use client";

import type { BrainIntent, BrainPriority, BrainTargetType, ContinuityCategory } from "@/lib/project-brain";

export interface BrainContextPayload {
  targetType: BrainTargetType;
  targetId?: string | null;
  targetLabel: string;
  phase?: string;
  intent?: BrainIntent;
  priority?: BrainPriority;
  category?: ContinuityCategory;
}

export function openProjectBrain(payload: BrainContextPayload) {
  window.dispatchEvent(new CustomEvent("project-brain:open", { detail: payload }));
}

interface BrainTargetButtonProps extends BrainContextPayload {
  label?: string;
  className?: string;
}

export default function BrainTargetButton({
  label = "Brain Note",
  className = "",
  ...payload
}: BrainTargetButtonProps) {
  return (
    <button
      type="button"
      onClick={() => openProjectBrain(payload)}
      className={`text-[10px] uppercase tracking-widest border px-3 py-2 transition-colors ${className}`}
      style={{
        borderColor: "rgba(76,201,240,0.45)",
        color: "var(--brand-cyan)",
        background: "rgba(76,201,240,0.08)",
      }}
    >
      {label}
    </button>
  );
}
