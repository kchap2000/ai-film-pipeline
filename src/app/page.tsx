"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Project } from "@/lib/types";
import ProjectCard from "@/components/ProjectCard";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="border-b border-amber-900/25 pb-8 mb-10">
        <p className="text-[10px] uppercase tracking-[0.25em] text-amber-600 mb-2">
          AI for Real Life
        </p>
        <div className="flex items-end justify-between">
          <h1 className="text-4xl font-bold tracking-tight text-neutral-100">
            Production Pipeline
          </h1>
          <Link
            href="/projects/new"
            className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors"
          >
            + New Project
          </Link>
        </div>
      </header>

      {/* Project Grid */}
      {loading ? (
        <div className="text-neutral-500 text-sm animate-pulse">
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-neutral-800 p-12 text-center">
          <p className="text-neutral-500 text-sm mb-4">No projects yet</p>
          <Link
            href="/projects/new"
            className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors"
          >
            Create Your First Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-800">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-16 pt-6 border-t border-amber-900/25 flex justify-between text-[10px] text-neutral-600 uppercase tracking-widest">
        <span>AI Film Production Pipeline</span>
        <span>
          <span className="text-amber-700">Khalil Chapman</span> &middot;
          Charleston, SC
        </span>
      </footer>
    </div>
  );
}
