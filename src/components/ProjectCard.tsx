"use client";

import Link from "next/link";
import { Project, PHASE_LABELS } from "@/lib/types";
import PhaseIndicator from "./PhaseIndicator";

export default function ProjectCard({ project }: { project: Project }) {
  const date = new Date(project.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="group border border-neutral-800 bg-neutral-950 p-6 transition-all hover:border-amber-800 hover:bg-neutral-900/50 cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-neutral-100 group-hover:text-amber-400 transition-colors">
              {project.title}
            </h3>
            <p className="text-xs text-neutral-500 mt-1">
              {project.type === "client" && project.client_name
                ? `Client: ${project.client_name}`
                : "Personal Project"}
            </p>
          </div>
          <span
            className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${
              project.type === "client"
                ? "border-blue-800/50 text-blue-400 bg-blue-950/30"
                : "border-amber-800/50 text-amber-400 bg-amber-950/30"
            }`}
          >
            {project.type}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
              Phase
            </p>
            <p className="text-xs text-amber-500">
              {PHASE_LABELS[project.phase_status]}
            </p>
          </div>
          <PhaseIndicator status={project.phase_status} />
        </div>

        <p className="text-[10px] text-neutral-600 mt-4">{date}</p>
      </div>
    </Link>
  );
}
