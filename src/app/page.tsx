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
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-600/80 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Production System V2.0
          </p>
          <div className="flex items-end justify-between">
            <h1 className="text-5xl font-black tracking-tight text-neutral-100 leading-none">
              Pipeline{" "}
              <span className="font-extralight text-neutral-400">Overview</span>
            </h1>
            <Link
              href="/projects/new"
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold uppercase tracking-widest px-5 py-3 rounded-xl transition-all duration-150 hover:shadow-lg hover:shadow-amber-500/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create Project
            </Link>
          </div>
        </header>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 h-52 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}

            {/* Add New Project card */}
            <Link href="/projects/new">
              <div className="group border-2 border-dashed border-neutral-700 hover:border-amber-700/60 rounded-2xl p-6 h-full min-h-[200px] flex flex-col items-center justify-center gap-3 transition-all duration-200 cursor-pointer hover:bg-amber-950/10">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 group-hover:bg-amber-900/30 border border-neutral-700 group-hover:border-amber-800/40 flex items-center justify-center transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5 text-neutral-500 group-hover:text-amber-500 transition-colors">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <p className="text-sm text-neutral-500 group-hover:text-amber-400 transition-colors font-medium">
                  Add New Project
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-neutral-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-900/30 border border-amber-800/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4 text-amber-500">
                <rect x="2" y="2" width="20" height="20" rx="3" />
                <path d="M7 2v20M17 2v20M2 7h5M17 7h5M2 12h20M2 17h5M17 17h5" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-300">AI Film Production</p>
              <p className="text-[10px] text-neutral-600 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                System Status: Operational
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-neutral-600 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3 h-3">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Charleston, SC
            </span>
            <span className="text-amber-700 font-medium">Khalil Chapman</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
