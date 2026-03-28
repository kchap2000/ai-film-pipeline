"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProjectType } from "@/lib/types";

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ProjectType>("personal");
  const [clientName, setClientName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          client_name: type === "client" ? clientName.trim() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }

      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="border-b border-amber-900/25 pb-8 mb-10">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-100 mt-4">
          New Project
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Title */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
            Project Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Last Signal — Episode 1"
            className="w-full bg-transparent border border-neutral-700 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-700 transition-colors"
            required
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
            Project Type
          </label>
          <div className="flex gap-3">
            {(["personal", "client"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 border px-4 py-3 text-xs uppercase tracking-widest transition-colors ${
                  type === t
                    ? "border-amber-700 text-amber-400 bg-amber-950/20"
                    : "border-neutral-700 text-neutral-500 hover:border-neutral-600"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Client Name (conditional) */}
        {type === "client" && (
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
              Client Name
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Netflix, A24, Independent"
              className="w-full bg-transparent border border-neutral-700 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-700 transition-colors"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-xs border border-red-900/50 bg-red-950/20 px-4 py-3">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="w-full border border-amber-700 text-amber-400 px-6 py-3 text-xs uppercase tracking-widest hover:bg-amber-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Creating..." : "Create Project"}
        </button>
      </form>
    </div>
  );
}
