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

const ROLE_COLORS: Record<string, { color: string; background: string; border: string }> = {
  lead:       { color: "var(--brand-orange)", background: "rgba(255,138,42,0.08)", border: "rgba(255,138,42,0.35)" },
  supporting: { color: "var(--brand-cyan)",   background: "rgba(76,201,240,0.08)",  border: "rgba(76,201,240,0.3)" },
  minor:      { color: "var(--brand-gray)",   background: "transparent",            border: "var(--brand-steel)" },
  extra:      { color: "var(--brand-gray)",   background: "transparent",            border: "var(--brand-steel)" },
  mentioned:  { color: "var(--brand-gray)",   background: "transparent",            border: "var(--brand-steel)" },
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
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
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
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <Link
            href={`/projects/${id}`}
            className="text-[10px] uppercase tracking-[0.25em] transition-colors"
            style={{ color: "var(--brand-orange)" }}
          >
            &larr; Back to Project
          </Link>
          <div
            className="rounded-xl p-10 mt-8 text-center"
            style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
          >
            <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>
              No extraction data found
            </p>
            <p className="text-xs mb-6" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
              Upload a script or document to your project, then run extraction to populate the Film Bible.
            </p>
            {extracting ? (
              <div className="text-sm animate-pulse" style={{ color: "var(--brand-orange)" }}>
                Running extraction via Claude... This may take 30-60 seconds.
              </div>
            ) : (
              <button
                onClick={runExtraction}
                className="text-xs uppercase tracking-widest px-6 py-2.5 transition-colors"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Run Extraction Now
              </button>
            )}
            {extractError && (
              <p className="text-red-400 text-xs px-4 py-3 mt-4" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                {extractError}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const structure = extraction?.structure;
  const phaseIndex = PHASE_ORDER.indexOf(project.phase_status);
  const canApprove = phaseIndex < 2;

  const sortedCharacters = [...characters].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  return (
    <>
    <ProjectNav projectId={id} currentPhase={project.phase_status} />
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
        <Link
          href={`/projects/${id}`}
          className="text-[10px] uppercase tracking-[0.25em] transition-colors"
          style={{ color: "var(--brand-orange)" }}
        >
          &larr; {project.title}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-4" style={{ color: "var(--brand-white)" }}>
          Film Bible
        </h1>
        {structure?.logline && (
          <p className="text-sm mt-3 max-w-2xl italic" style={{ color: "var(--brand-gray)" }}>
            {structure.logline}
          </p>
        )}
        <div className="flex gap-4 mt-4">
          {structure?.genre && (
            <span
              className="text-[10px] uppercase tracking-widest px-3 py-1"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.35)" }}
            >
              {structure.genre}
            </span>
          )}
          {structure?.episode_title && (
            <span
              className="text-[10px] uppercase tracking-widest px-3 py-1"
              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
            >
              {structure.episode_title}
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-0 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
        {(["overview", "characters", "scenes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-6 py-3 text-[10px] uppercase tracking-widest border-b-2 transition-colors"
            style={{
              borderBottomColor: activeTab === tab ? "var(--brand-orange)" : "transparent",
              color: activeTab === tab ? "var(--brand-orange)" : "var(--brand-gray)",
            }}
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
          {structure?.themes && structure.themes.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                Themes
              </h2>
              <div className="flex flex-wrap gap-2">
                {structure.themes.map((theme, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5"
                    style={{ color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </section>
          )}

          {structure?.acts && structure.acts.length > 0 && (
            <section>
              <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                Act Structure
              </h2>
              <div className="space-y-px">
                {structure.acts.map((act) => (
                  <div
                    key={act.act_number}
                    className="p-5"
                    style={{
                      borderLeft: "2px solid rgba(255,138,42,0.35)",
                      background: "var(--brand-mid)",
                    }}
                  >
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-xs font-bold" style={{ color: "var(--brand-orange)" }}>
                        Act {act.act_number}
                      </span>
                      {act.title && (
                        <span className="text-sm" style={{ color: "var(--brand-white)" }}>
                          {act.title}
                        </span>
                      )}
                      <span className="text-[10px] ml-auto" style={{ color: "var(--brand-gray)" }}>
                        Scenes {act.scene_range[0]}&ndash;{act.scene_range[1]}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                      {act.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "var(--brand-steel)" }}>
              {[
                { label: "Characters", value: characters.length },
                { label: "Scenes", value: scenes.length },
                { label: "Leads", value: characters.filter((c) => c.role === "lead").length },
                { label: "Locations", value: new Set(scenes.map((s) => s.location)).size },
              ].map((stat) => (
                <div key={stat.label} className="p-5" style={{ background: "var(--brand-mid)" }}>
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)" }}>
                    {stat.label}
                  </p>
                  <p className="text-2xl font-light" style={{ color: "var(--brand-orange)" }}>
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
            const rc = ROLE_COLORS[char.role] || ROLE_COLORS.minor;
            return (
              <div
                key={char.id}
                className="p-5 transition-colors"
                style={{
                  border: isEditing
                    ? "1px solid rgba(255,138,42,0.4)"
                    : "1px solid var(--brand-steel)",
                  background: isEditing ? "rgba(255,138,42,0.04)" : "var(--brand-mid)",
                  marginBottom: "1px",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg" style={{ color: "var(--brand-white)" }}>{char.name}</h3>
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
                          className="text-[10px] uppercase tracking-widest px-3 py-1 transition-colors"
                          style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEdit(char)}
                        className="text-[10px] uppercase tracking-widest px-3 py-1 transition-colors"
                        style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--brand-orange)";
                          e.currentTarget.style.borderColor = "rgba(255,138,42,0.4)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--brand-gray)";
                          e.currentTarget.style.borderColor = "var(--brand-steel)";
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <span
                      className="text-[10px] uppercase tracking-widest px-2 py-1"
                      style={{
                        color: rc.color,
                        background: rc.background,
                        border: `1px solid ${rc.border}`,
                      }}
                    >
                      {char.role}
                    </span>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)" }}>Role</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {["lead", "supporting", "minor", "extra", "mentioned"].map((r) => {
                          const rc2 = ROLE_COLORS[r] || ROLE_COLORS.minor;
                          return (
                            <button
                              key={r}
                              onClick={() => setEditState((s) => ({ ...s, role: r }))}
                              className="text-[10px] uppercase tracking-widest px-2.5 py-1 transition-colors"
                              style={{
                                color: editState.role === r ? rc2.color : "var(--brand-gray)",
                                background: editState.role === r ? rc2.background : "transparent",
                                border: `1px solid ${editState.role === r ? rc2.border : "var(--brand-steel)"}`,
                              }}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditState((s) => ({ ...s, voice_only: !s.voice_only }))}
                        className={`w-8 h-4 rounded-full transition-colors relative ${editState.voice_only ? "bg-purple-600" : "bg-neutral-700"}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${editState.voice_only ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      <span className="text-xs" style={{ color: "var(--brand-gray)" }}>Voice Only (V.O. / O.S. — never physically on screen)</span>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)" }}>Physical Description</p>
                      <textarea
                        value={editState.description}
                        onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                        rows={4}
                        className="w-full text-xs p-3 focus:outline-none resize-none leading-relaxed"
                        style={{
                          background: "var(--brand-navy)",
                          border: "1px solid var(--brand-steel)",
                          color: "var(--brand-white)",
                        }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-orange)")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
                        placeholder="Age, build, hair color, ethnicity, distinguishing features…"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)" }}>Personality</p>
                      <textarea
                        value={editState.personality}
                        onChange={(e) => setEditState((s) => ({ ...s, personality: e.target.value }))}
                        rows={3}
                        className="w-full text-xs p-3 focus:outline-none resize-none leading-relaxed"
                        style={{
                          background: "var(--brand-navy)",
                          border: "1px solid var(--brand-steel)",
                          color: "var(--brand-white)",
                        }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-orange)")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
                        placeholder="Personality traits, demeanor, emotional arc…"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {char.description && (
                      <div className="mb-3">
                        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                          Physical Description
                        </p>
                        <p
                          className="text-xs leading-relaxed"
                          style={{
                            color: char.description.startsWith("No physical description")
                              ? "var(--brand-gray)"
                              : "var(--brand-gray)",
                            opacity: char.description.startsWith("No physical description") ? 0.4 : 1,
                            fontStyle: char.description.startsWith("No physical description") ? "italic" : "normal",
                          }}
                        >
                          {char.description}
                        </p>
                      </div>
                    )}
                    {char.personality && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                          Personality
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--brand-gray)" }}>
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
              className="p-5 transition-colors"
              style={{
                border: "1px solid var(--brand-steel)",
                background: "var(--brand-mid)",
                marginBottom: "1px",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,138,42,0.25)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--brand-steel)")}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-bold" style={{ color: "var(--brand-orange)" }}>
                    Scene {scene.scene_number}
                  </span>
                  <span className="text-sm" style={{ color: "var(--brand-white)" }}>
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
                    <span
                      className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                      style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                    >
                      {scene.time_of_day}
                    </span>
                  )}
                  {scene.mood && (
                    <span
                      className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                      style={{ color: "var(--brand-orange)", opacity: 0.7, border: "1px solid rgba(255,138,42,0.25)" }}
                    >
                      {scene.mood}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--brand-gray)" }}>
                {scene.action_summary}
              </p>

              {scene.characters_present && scene.characters_present.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                    Characters
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {scene.characters_present.map((name, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5"
                        style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {scene.props && scene.props.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                    Props
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {scene.props.map((prop, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5"
                        style={{ color: "var(--brand-gray)", opacity: 0.7, border: "1px solid var(--brand-steel)" }}
                      >
                        {prop}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {scene.wardrobe && scene.wardrobe.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
                    Wardrobe
                  </p>
                  <div className="space-y-1">
                    {scene.wardrobe.map((w, i) => (
                      <p key={i} className="text-[10px]" style={{ color: "var(--brand-gray)", opacity: 0.7 }}>
                        <span style={{ color: "var(--brand-gray)" }}>{w.character}:</span>{" "}
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
      <div className="mt-12 pt-8" style={{ borderTop: "1px solid var(--brand-steel)" }}>
        {canApprove ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm" style={{ color: "var(--brand-white)" }}>
                Phase Gate: Approve Film Bible
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
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
              className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              Continue to AI Casting &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
    </div>
    </>
  );
}
