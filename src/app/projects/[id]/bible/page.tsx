"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Project,
  Character,
  Scene,
  PHASE_LABELS,
  PHASE_ORDER,
} from "@/lib/types";
import ProjectNav from "@/components/ProjectNav";

interface ExtractionData {
  structure: {
    acts?: { act_number: number; title: string | null; description: string; scene_range: [number, number] }[];
    episode_title?: string | null;
    genre?: string;
    logline?: string;
    themes?: string[];
  };
}

const ROLE_ORDER = ["lead", "supporting", "minor", "extra", "mentioned"];

const ROLE_COLORS: Record<string, string> = {
  lead: "border-amber-700 text-amber-400 bg-amber-950/30",
  supporting: "border-blue-800/50 text-blue-400 bg-blue-950/30",
  minor: "border-neutral-700 text-neutral-400",
  extra: "border-neutral-800 text-neutral-500",
  mentioned: "border-neutral-800 text-neutral-600",
};

interface EditState {
  description: string;
  personality: string;
  role: string;
  voice_only: boolean;
}

export default function FilmBible() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [extraction, setExtraction] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "characters" | "scenes">("overview");
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ description: "", personality: "", role: "", voice_only: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}/bible`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data.project);
        setCharacters(data.characters || []);
        setScenes(data.scenes || []);
        setExtraction(data.extraction || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const approveBible = async () => {
    setApproving(true);
    const res = await fetch(`/api/projects/${id}/bible`, { method: "POST" });
    if (res.ok) {
      router.push(`/projects/${id}`);
    }
    setApproving(false);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-neutral-500 text-sm animate-pulse">
        Loading Film Bible...
      </div>
    );
  }

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      // Reload bible data
      const bibleRes = await fetch(`/api/projects/${id}/bible`);
      if (bibleRes.ok) {
        const bibleData = await bibleRes.json();
        setProject(bibleData.project);
        setCharacters(bibleData.characters || []);
        setScenes(bibleData.scenes || []);
        setExtraction(bibleData.extraction || null);
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const startEdit = (char: Character) => {
    setEditingCharId(char.id);
    setEditState({
      description: char.description || "",
      personality: char.personality || "",
      role: char.role,
      voice_only: char.voice_only ?? false,
    });
  };

  const saveCharacter = async (charId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}/bible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: charId, ...editState }),
      });
      if (res.ok) {
        const data = await res.json();
        setCharacters((prev) =>
          prev.map((c) => (c.id === charId ? data.character : c))
        );
        setEditingCharId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!project || (characters.length === 0 && scenes.length === 0 && !extracting)) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link
          href={`/projects/${id}`}
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; Back to Project
        </Link>
        <div className="border border-neutral-800 p-10 mt-8 text-center">
          <p className="text-neutral-400 text-sm mb-2">
            No extraction data found
          </p>
          <p className="text-neutral-600 text-xs mb-6">
            Upload a script or document to your project, then run extraction to populate the Film Bible.
          </p>
          {extracting ? (
            <div className="text-amber-500 text-sm animate-pulse">
              Running extraction via Claude... This may take 30-60 seconds.
            </div>
          ) : (
            <button
              onClick={runExtraction}
              className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-6 py-2.5 hover:bg-amber-950/30 transition-colors"
            >
              Run Extraction Now
            </button>
          )}
          {extractError && (
            <p className="text-red-400 text-xs border border-red-900/50 bg-red-950/20 px-4 py-3 mt-4">
              {extractError}
            </p>
          )}
        </div>
      </div>
    );
  }

  const structure = extraction?.structure;
  const phaseIndex = PHASE_ORDER.indexOf(project.phase_status);
  const canApprove = phaseIndex < 2; // not yet at bible phase

  const sortedCharacters = [...characters].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  return (
    <>
    <ProjectNav projectId={id} currentPhase={project.phase_status} />
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="border-b border-amber-900/25 pb-8 mb-8">
        <Link
          href={`/projects/${id}`}
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; {project.title}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-100 mt-4">
          Film Bible
        </h1>
        {structure?.logline && (
          <p className="text-sm text-neutral-400 mt-3 max-w-2xl italic">
            {structure.logline}
          </p>
        )}
        <div className="flex gap-4 mt-4">
          {structure?.genre && (
            <span className="text-[10px] uppercase tracking-widest text-amber-500 border border-amber-800/50 px-3 py-1">
              {structure.genre}
            </span>
          )}
          {structure?.episode_title && (
            <span className="text-[10px] uppercase tracking-widest text-neutral-400 border border-neutral-700 px-3 py-1">
              {structure.episode_title}
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-0 border-b border-neutral-800 mb-8">
        {(["overview", "characters", "scenes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-[10px] uppercase tracking-widest border-b-2 transition-colors ${
              activeTab === tab
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-neutral-600 hover:text-neutral-400"
            }`}
          >
            {tab}
            {tab === "characters" && ` (${characters.length})`}
            {tab === "scenes" && ` (${scenes.length})`}
          </button>
        ))}
      </nav>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          {/* Themes */}
          {structure?.themes && structure.themes.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
                Themes
              </h2>
              <div className="flex flex-wrap gap-2">
                {structure.themes.map((theme, i) => (
                  <span
                    key={i}
                    className="text-xs text-neutral-300 border border-neutral-700 px-3 py-1.5"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Act Structure */}
          {structure?.acts && structure.acts.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
                Act Structure
              </h2>
              <div className="space-y-px">
                {structure.acts.map((act) => (
                  <div
                    key={act.act_number}
                    className="border-l-2 border-amber-800/40 bg-neutral-900/50 p-5"
                  >
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-amber-600 text-xs font-bold">
                        Act {act.act_number}
                      </span>
                      {act.title && (
                        <span className="text-neutral-300 text-sm">
                          {act.title}
                        </span>
                      )}
                      <span className="text-neutral-600 text-[10px] ml-auto">
                        Scenes {act.scene_range[0]}&ndash;{act.scene_range[1]}
                      </span>
                    </div>
                    <p className="text-neutral-400 text-xs leading-relaxed">
                      {act.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Summary Stats */}
          <section>
            <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
              Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-800">
              {[
                { label: "Characters", value: characters.length },
                { label: "Scenes", value: scenes.length },
                {
                  label: "Leads",
                  value: characters.filter((c) => c.role === "lead").length,
                },
                {
                  label: "Locations",
                  value: new Set(scenes.map((s) => s.location)).size,
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-neutral-950 p-5">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
                    {stat.label}
                  </p>
                  <p className="text-2xl text-amber-400 font-light">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Characters Tab */}
      {activeTab === "characters" && (
        <div className="space-y-px">
          {sortedCharacters.map((char) => {
            const isEditing = editingCharId === char.id;
            return (
              <div
                key={char.id}
                className={`border p-5 transition-colors ${isEditing ? "border-amber-800/50 bg-amber-950/10" : "border-neutral-800 hover:border-neutral-700"}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg text-neutral-100">{char.name}</h3>
                    {char.voice_only && (
                      <span className="text-[9px] uppercase tracking-widest text-purple-400 border border-purple-800/50 bg-purple-950/20 px-2 py-0.5">
                        Voice Only
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveCharacter(char.id)}
                          disabled={saving}
                          className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-3 py-1 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingCharId(null)}
                          className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-3 py-1 hover:bg-neutral-800/30 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEdit(char)}
                        className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-3 py-1 hover:text-amber-400 hover:border-amber-800/50 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    <span
                      className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${
                        ROLE_COLORS[char.role] || ROLE_COLORS.minor
                      }`}
                    >
                      {char.role}
                    </span>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    {/* Role selector */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1.5">Role</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {["lead", "supporting", "minor", "extra", "mentioned"].map((r) => (
                          <button
                            key={r}
                            onClick={() => setEditState((s) => ({ ...s, role: r }))}
                            className={`text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-colors ${
                              editState.role === r
                                ? ROLE_COLORS[r] || "border-amber-700 text-amber-400"
                                : "border-neutral-700 text-neutral-500 hover:border-neutral-600"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Voice Only toggle */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditState((s) => ({ ...s, voice_only: !s.voice_only }))}
                        className={`w-8 h-4 rounded-full transition-colors relative ${editState.voice_only ? "bg-purple-600" : "bg-neutral-700"}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${editState.voice_only ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      <span className="text-xs text-neutral-400">Voice Only (V.O. / O.S. — never physically on screen)</span>
                    </div>
                    {/* Description */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1.5">Physical Description</p>
                      <textarea
                        value={editState.description}
                        onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                        rows={4}
                        className="w-full bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 p-3 focus:outline-none focus:border-amber-700 resize-none leading-relaxed"
                        placeholder="Age, build, hair color, ethnicity, distinguishing features…"
                      />
                    </div>
                    {/* Personality */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1.5">Personality</p>
                      <textarea
                        value={editState.personality}
                        onChange={(e) => setEditState((s) => ({ ...s, personality: e.target.value }))}
                        rows={3}
                        className="w-full bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 p-3 focus:outline-none focus:border-amber-700 resize-none leading-relaxed"
                        placeholder="Personality traits, demeanor, emotional arc…"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {char.description && (
                      <div className="mb-3">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
                          Physical Description
                        </p>
                        <p className={`text-xs leading-relaxed ${char.description.startsWith("No physical description") ? "text-neutral-600 italic" : "text-neutral-400"}`}>
                          {char.description}
                        </p>
                      </div>
                    )}
                    {char.personality && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
                          Personality
                        </p>
                        <p className="text-xs text-neutral-400 leading-relaxed">
                          {char.personality}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Scenes Tab */}
      {activeTab === "scenes" && (
        <div className="space-y-px">
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="border border-neutral-800 p-5 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-amber-600 text-xs font-bold">
                    Scene {scene.scene_number}
                  </span>
                  <span className="text-neutral-300 text-sm">
                    {scene.location}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {scene.scene_type && scene.scene_type !== "real" && (
                    <span className="text-[10px] uppercase tracking-widest text-purple-400 border border-purple-800/40 bg-purple-950/20 px-2 py-0.5">
                      {scene.scene_type}
                    </span>
                  )}
                  {scene.time_of_day && (
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-2 py-0.5">
                      {scene.time_of_day}
                    </span>
                  )}
                  {scene.mood && (
                    <span className="text-[10px] uppercase tracking-widest text-amber-600/70 border border-amber-900/30 px-2 py-0.5">
                      {scene.mood}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-neutral-400 leading-relaxed mb-3">
                {scene.action_summary}
              </p>

              {/* Characters present */}
              {scene.characters_present && scene.characters_present.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
                    Characters
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {scene.characters_present.map((name, i) => (
                      <span
                        key={i}
                        className="text-[10px] text-neutral-400 border border-neutral-700 px-2 py-0.5"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Props */}
              {scene.props && scene.props.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
                    Props
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {scene.props.map((prop, i) => (
                      <span
                        key={i}
                        className="text-[10px] text-neutral-500 border border-neutral-800 px-2 py-0.5"
                      >
                        {prop}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Wardrobe */}
              {scene.wardrobe && scene.wardrobe.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">
                    Wardrobe
                  </p>
                  <div className="space-y-1">
                    {scene.wardrobe.map((w, i) => (
                      <p key={i} className="text-[10px] text-neutral-500">
                        <span className="text-neutral-400">{w.character}:</span>{" "}
                        {w.description}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve Bible Gate */}
      <div className="mt-12 border-t border-amber-900/25 pt-8">
        {canApprove ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-300">
                Phase Gate: Approve Film Bible
              </p>
              <p className="text-xs text-neutral-600 mt-1">
                Locking the bible advances the project to the AI Casting phase.
              </p>
            </div>
            <button
              onClick={approveBible}
              disabled={approving}
              className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-6 py-2.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
            >
              {approving ? "Approving..." : "Approve & Lock Bible"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs text-green-500 uppercase tracking-widest">
              Film Bible approved
            </p>
            <Link
              href={`/projects/${id}/cast`}
              className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors"
            >
              Continue to AI Casting &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
