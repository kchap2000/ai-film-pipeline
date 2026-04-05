"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Project,
  Character,
  Scene,
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

interface CharacterWithHeadshot extends Character {
  approved_variation_id?: string | null;
}

const ROLE_ORDER = ["lead", "supporting", "minor", "extra", "mentioned"];
const FEATURED_ROLES = ["lead", "supporting"];

const ROLE_STYLE: Record<string, { color: string; border: string; bg: string }> = {
  lead:       { color: "#FF8A2A", border: "rgba(255,138,42,0.5)", bg: "rgba(255,138,42,0.1)" },
  supporting: { color: "#4CC9F0", border: "rgba(76,201,240,0.4)", bg: "rgba(76,201,240,0.08)" },
  minor:      { color: "#9BA4B5", border: "rgba(155,164,181,0.35)", bg: "transparent" },
  extra:      { color: "#9BA4B5", border: "rgba(155,164,181,0.3)", bg: "transparent" },
  mentioned:  { color: "#9BA4B5", border: "rgba(155,164,181,0.25)", bg: "transparent" },
};

interface EditState {
  description: string;
  personality: string;
  role: string;
  voice_only: boolean;
}

// ──────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-5 mb-10">
      <span
        style={{
          fontFamily: "'Barlow Condensed', 'Bebas Neue', sans-serif",
          fontWeight: 700,
          fontSize: "1.1rem",
          letterSpacing: "0.22em",
          color: "var(--brand-orange)",
        }}
      >
        {title}
      </span>
      <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right, rgba(255,138,42,0.5), transparent)" }} />
    </div>
  );
}

// ──────────────────────────────────────────
// Main page
// ──────────────────────────────────────────

export default function FilmBible() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [characters, setCharacters] = useState<CharacterWithHeadshot[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [extraction, setExtraction] = useState<ExtractionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [editingCharId, setEditingCharId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ description: "", personality: "", role: "", voice_only: false });
  const [saving, setSaving] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [sceneEditState, setSceneEditState] = useState<{ location: string; time_of_day: string; mood: string; action_summary: string; scene_type: string }>({ location: "", time_of_day: "", mood: "", action_summary: "", scene_type: "real" });
  const [savingScene, setSavingScene] = useState(false);
  const [generatingPoseSheet, setGeneratingPoseSheet] = useState<Set<string>>(new Set());
  const [poseSheetError, setPoseSheetError] = useState<Record<string, string>>({});
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());

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
    if (res.ok) router.push(`/projects/${id}`);
    setApproving(false);
  };

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      let data: { error?: string } = {};
      try { data = await res.json(); } catch {
        throw new Error(res.status >= 500 ? `Server error (${res.status}). Please try again.` : "Extraction failed");
      }
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

  const startEdit = (char: CharacterWithHeadshot) => {
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
        setCharacters((prev) => prev.map((c) => (c.id === charId ? { ...data.character, approved_variation_id: c.approved_variation_id } : c)));
        setEditingCharId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const startSceneEdit = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setSceneEditState({
      location: scene.location || "",
      time_of_day: scene.time_of_day || "",
      mood: scene.mood || "",
      action_summary: scene.action_summary || "",
      scene_type: (scene as unknown as { scene_type?: string }).scene_type || "real",
    });
  };

  const saveScene = async (sceneId: string) => {
    setSavingScene(true);
    try {
      const res = await fetch(`/api/projects/${id}/bible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_id: sceneId, ...sceneEditState }),
      });
      if (res.ok) {
        const data = await res.json();
        setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...data.scene } : s)));
        setEditingSceneId(null);
      }
    } finally {
      setSavingScene(false);
    }
  };

  const generatePoseSheetForChar = async (charId: string) => {
    setGeneratingPoseSheet((prev) => new Set(prev).add(charId));
    setPoseSheetError((prev) => { const n = { ...prev }; delete n[charId]; return n; });
    try {
      const res = await fetch(`/api/projects/${id}/posesheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: charId }),
      });
      let data: { pose_sheet_url?: string; error?: string } = {};
      try { data = await res.json(); } catch { /* ignore */ }
      if (!res.ok) throw new Error(data.error || "Pose sheet generation failed");
      if (data.pose_sheet_url) {
        setImageCache((prev) => ({ ...prev, [`pose-${charId}`]: data.pose_sheet_url as string }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setPoseSheetError((prev) => ({ ...prev, [charId]: msg }));
    } finally {
      setGeneratingPoseSheet((prev) => { const n = new Set(prev); n.delete(charId); return n; });
    }
  };

  // Lazy-load headshot and pose sheet images for characters
  const fetchBibleImage = useCallback(async (key: string, url: string) => {
    if (imageCache[key] || loadingImages.has(key)) return;
    setLoadingImages((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const imgUrl = data.image_url || data.pose_sheet_url;
        if (imgUrl) {
          setImageCache((prev) => ({ ...prev, [key]: imgUrl }));
        }
      }
    } catch { /* silent */ } finally {
      setLoadingImages((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [imageCache, loadingImages]);

  useEffect(() => {
    for (const c of characters) {
      if (c.approved_variation_id) {
        fetchBibleImage(`headshot-${c.id}`, `/api/projects/${id}/cast/image?variation_id=${c.approved_variation_id}`);
        fetchBibleImage(`pose-${c.id}`, `/api/projects/${id}/cast/image?character_id=${c.id}&type=pose`);
      }
    }
  }, [characters, id, fetchBibleImage]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-navy)" }}>
        <span className="text-sm animate-pulse" style={{ color: "var(--brand-gray)" }}>Loading Film Bible...</span>
      </div>
    );
  }

  if (!project || (characters.length === 0 && scenes.length === 0 && !extracting)) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <Link href={`/projects/${id}`} className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
            &larr; Back to Project
          </Link>
          <div className="rounded-xl p-10 mt-8 text-center" style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}>
            <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No extraction data found</p>
            <p className="text-xs mb-6" style={{ color: "var(--brand-gray)", opacity: 0.6 }}>
              Upload a script or document, then run extraction to populate the Film Bible.
            </p>
            {extracting ? (
              <div className="text-sm animate-pulse" style={{ color: "var(--brand-orange)" }}>Running extraction... This may take 30–60 seconds.</div>
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
  // Any character with a headshot gets the full card — not just lead/supporting
  const featuredCharacters = sortedCharacters.filter((c) => FEATURED_ROLES.includes(c.role) || !!imageCache[`headshot-${c.id}`]);
  const secondaryCharacters = sortedCharacters.filter((c) => !FEATURED_ROLES.includes(c.role) && !imageCache[`headshot-${c.id}`]);
  const uniqueLocations = new Set(scenes.map((s) => s.location)).size;

  return (
    <>
      <ProjectNav projectId={id} currentPhase={project.phase_status} />
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>

        {/* ── HERO ─────────────────────────────────── */}
        <header style={{ borderBottom: "1px solid var(--brand-steel)", background: "var(--brand-navy)" }}>
          <div className="max-w-6xl mx-auto px-6 pt-14 pb-12">

            {/* Breadcrumb + badge row */}
            <div className="flex items-center justify-between mb-8">
              <Link
                href={`/projects/${id}`}
                className="text-[10px] uppercase tracking-[0.25em] transition-colors"
                style={{ color: "var(--brand-orange)" }}
              >
                &larr; {project.title}
              </Link>
              <span
                className="text-[9px] uppercase tracking-[0.25em] px-3 py-1.5"
                style={{
                  color: "var(--brand-gray)",
                  border: "1px solid var(--brand-steel)",
                  letterSpacing: "0.22em",
                }}
              >
                Confidential — Film Bible
              </span>
            </div>

            {/* Project title */}
            <h1
              style={{
                fontFamily: "'Bebas Neue', 'Barlow Condensed', 'Impact', sans-serif",
                fontSize: "clamp(3rem, 8vw, 6rem)",
                lineHeight: 0.95,
                letterSpacing: "0.04em",
                color: "var(--brand-white)",
                marginBottom: "1.25rem",
              }}
            >
              {project.title.toUpperCase()}
            </h1>

            {/* Logline */}
            {structure?.logline && (
              <p
                className="max-w-2xl italic leading-relaxed mb-5"
                style={{ color: "var(--brand-gray)", fontSize: "0.9rem" }}
              >
                &ldquo;{structure.logline}&rdquo;
              </p>
            )}

            {/* Tags row */}
            <div className="flex gap-3 flex-wrap">
              {structure?.genre && (
                <span
                  className="text-[10px] uppercase tracking-widest px-3 py-1.5"
                  style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                >
                  {structure.genre}
                </span>
              )}
              {structure?.episode_title && (
                <span
                  className="text-[10px] uppercase tracking-widest px-3 py-1.5"
                  style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                >
                  {structure.episode_title}
                </span>
              )}
              {project.type === "client" && project.client_name && (
                <span
                  className="text-[10px] uppercase tracking-widest px-3 py-1.5"
                  style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.3)" }}
                >
                  Client: {project.client_name}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ── STATS BAR ──────────────────────────────── */}
        <div style={{ background: "var(--brand-mid)", borderBottom: "1px solid var(--brand-steel)" }}>
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="flex gap-0 divide-x" style={{ borderColor: "var(--brand-steel)" }}>
              {[
                { label: "Characters", value: characters.length },
                { label: "Scenes", value: scenes.length },
                { label: "Lead Roles", value: characters.filter((c) => c.role === "lead").length },
                { label: "Locations", value: uniqueLocations },
                { label: "Cast Locked", value: characters.filter((c) => imageCache[`headshot-${c.id}`]).length },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className="px-8 first:pl-0"
                  style={{ borderColor: "var(--brand-steel)" }}
                >
                  <p
                    style={{
                      fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif",
                      fontSize: "2rem",
                      lineHeight: 1,
                      color: i === 0 ? "var(--brand-orange)" : "var(--brand-white)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {stat.value}
                  </p>
                  <p className="text-[9px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── THEMES ─────────────────────────────────── */}
        {structure?.themes && structure.themes.length > 0 && (
          <div style={{ background: "rgba(255,138,42,0.04)", borderBottom: "1px solid rgba(255,138,42,0.12)" }}>
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
              <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-orange)", opacity: 0.7 }}>
                Themes:
              </span>
              {structure.themes.map((theme, i) => (
                <span key={i} className="text-[10px]" style={{ color: "var(--brand-gray)" }}>
                  {theme}{i < structure.themes!.length - 1 && <span style={{ color: "var(--brand-steel)", marginLeft: "1rem" }}>·</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-6 py-16">

          {/* ── CHARACTERS ────────────────────── */}
          {sortedCharacters.length > 0 && (
            <section className="mb-20">
              <SectionDivider title="Characters" />

              {/* Featured (Lead + Supporting) */}
              <div className="space-y-6 mb-12">
                {featuredCharacters.map((char) => (
                  <div key={char.id}>
                  <FeaturedCharacterCard
                    char={char}
                    isEditing={editingCharId === char.id}
                    editState={editState}
                    saving={saving}
                    imageCache={imageCache}
                    onStartEdit={() => startEdit(char)}
                    onCancelEdit={() => setEditingCharId(null)}
                    onSave={() => saveCharacter(char.id)}
                    onEditChange={(field, val) => setEditState((s) => ({ ...s, [field]: val }))}
                  />
                  {/* Pose sheet strip */}
                  {imageCache[`headshot-${char.id}`] && (
                    <div
                      style={{
                        marginTop: "1px",
                        border: "1px solid var(--brand-steel)",
                        borderTop: "1px solid rgba(255,138,42,0.15)",
                        background: "rgba(11,28,45,0.6)",
                      }}
                    >
                      {generatingPoseSheet.has(char.id) ? (
                        <div className="flex items-center gap-3 px-7 py-5">
                          <div
                            className="w-4 h-4 rounded-full border-2 animate-spin"
                            style={{ borderColor: "var(--brand-orange)", borderTopColor: "transparent" }}
                          />
                          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                            Generating character reference sheet...
                          </span>
                        </div>
                      ) : poseSheetError[char.id] ? (
                        <div className="flex items-center justify-between px-7 py-4">
                          <span className="text-[10px]" style={{ color: "rgba(239,68,68,0.8)" }}>
                            {poseSheetError[char.id]}
                          </span>
                          <button
                            onClick={() => generatePoseSheetForChar(char.id)}
                            className="text-[9px] uppercase tracking-widest px-3 py-1 transition-colors"
                            style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : imageCache[`pose-${char.id}`] ? (
                        <div>
                          <div className="flex items-center justify-between px-7 py-3">
                            <span
                              style={{
                                fontFamily: "'Barlow Condensed', 'Bebas Neue', sans-serif",
                                fontWeight: 700,
                                fontSize: "0.75rem",
                                letterSpacing: "0.2em",
                                color: "var(--brand-orange)",
                              }}
                            >
                              CHARACTER REFERENCE SHEET
                            </span>
                            <button
                              onClick={() => generatePoseSheetForChar(char.id)}
                              className="text-[9px] uppercase tracking-widest px-2 py-0.5 transition-colors"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand-orange)"; e.currentTarget.style.borderColor = "rgba(255,138,42,0.4)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--brand-gray)"; e.currentTarget.style.borderColor = "var(--brand-steel)"; }}
                            >
                              Regenerate
                            </button>
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageCache[`pose-${char.id}`]}
                            alt={`${char.name} character reference sheet`}
                            style={{ width: "100%", display: "block", maxHeight: "480px", objectFit: "contain", background: "#0a0f18" }}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                ))}
              </div>

              {/* Secondary characters */}
              {secondaryCharacters.length > 0 && (
                <div>
                  <p
                    className="text-[10px] uppercase tracking-widest mb-4"
                    style={{ color: "var(--brand-gray)", opacity: 0.5 }}
                  >
                    Additional Characters
                  </p>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ border: "1px solid var(--brand-steel)" }}
                  >
                    {secondaryCharacters.map((char, i) => {
                      const rs = ROLE_STYLE[char.role] || ROLE_STYLE.minor;
                      const isEditing = editingCharId === char.id;
                      return (
                        <div
                          key={char.id}
                          style={{
                            background: isEditing ? "rgba(255,138,42,0.04)" : i % 2 === 0 ? "var(--brand-mid)" : "transparent",
                            borderTop: i > 0 ? "1px solid var(--brand-steel)" : "none",
                          }}
                        >
                          {/* Row header */}
                          <div className="flex items-center gap-4 px-5 py-4">
                            <span
                              className="text-[9px] uppercase tracking-widest px-2 py-0.5 shrink-0"
                              style={{ color: rs.color, border: `1px solid ${rs.border}`, background: rs.bg }}
                            >
                              {char.role}
                            </span>
                            <span
                              style={{
                                fontFamily: "'Barlow Condensed', 'Bebas Neue', sans-serif",
                                fontWeight: 700,
                                fontSize: "1.05rem",
                                letterSpacing: "0.06em",
                                color: "var(--brand-white)",
                                flex: 1,
                              }}
                            >
                              {char.name.toUpperCase()}
                            </span>
                            {char.voice_only && (
                              <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 shrink-0 text-purple-400 border border-purple-800/40">V.O.</span>
                            )}
                            {char.description && !isEditing && (
                              <span className="text-xs hidden md:block truncate max-w-xs" style={{ color: "var(--brand-gray)", flex: 2 }}>
                                {char.description.startsWith("No physical") ? "" : char.description}
                              </span>
                            )}
                            <button
                              onClick={() => isEditing ? setEditingCharId(null) : startEdit(char)}
                              className="text-[9px] uppercase tracking-widest px-2.5 py-1 shrink-0 transition-colors"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand-orange)"; e.currentTarget.style.borderColor = "rgba(255,138,42,0.4)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--brand-gray)"; e.currentTarget.style.borderColor = "var(--brand-steel)"; }}
                            >
                              {isEditing ? "Close" : "Edit"}
                            </button>
                          </div>

                          {/* Inline edit panel */}
                          {isEditing && (
                            <div className="px-5 pb-5 space-y-4">
                              <CharacterEditFields
                                editState={editState}
                                saving={saving}
                                onSave={() => saveCharacter(char.id)}
                                onCancel={() => setEditingCharId(null)}
                                onChange={(field, val) => setEditState((s) => ({ ...s, [field]: val }))}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── ACT STRUCTURE ─────────────────── */}
          {structure?.acts && structure.acts.length > 0 && (
            <section className="mb-20">
              <SectionDivider title="Structure" />
              <div className="space-y-3">
                {structure.acts.map((act) => (
                  <div
                    key={act.act_number}
                    className="p-6"
                    style={{
                      background: "var(--brand-mid)",
                      border: "1px solid var(--brand-steel)",
                      borderLeft: "3px solid rgba(255,138,42,0.5)",
                    }}
                  >
                    <div className="flex items-baseline gap-4 mb-3">
                      <span
                        style={{
                          fontFamily: "'Barlow Condensed', 'Bebas Neue', sans-serif",
                          fontWeight: 700,
                          fontSize: "0.95rem",
                          letterSpacing: "0.2em",
                          color: "var(--brand-orange)",
                        }}
                      >
                        ACT {act.act_number}
                      </span>
                      {act.title && (
                        <span className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
                          {act.title}
                        </span>
                      )}
                      <span className="text-[10px] ml-auto" style={{ color: "var(--brand-gray)" }}>
                        Scenes {act.scene_range[0]}–{act.scene_range[1]}
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

          {/* ── SCENES ────────────────────────── */}
          {scenes.length > 0 && (
            <section className="mb-20">
              <SectionDivider title={`Scenes (${scenes.length})`} />
              <div className="space-y-3">
                {scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className="transition-all"
                    style={{
                      background: "var(--brand-mid)",
                      border: "1px solid var(--brand-steel)",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,138,42,0.3)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--brand-steel)")}
                  >
                    {/* Scene header bar */}
                    <div
                      className="px-5 py-3 flex items-center gap-4"
                      style={{ borderBottom: "1px solid var(--brand-steel)" }}
                    >
                      <span
                        style={{
                          fontFamily: "'Barlow Condensed', 'Bebas Neue', sans-serif",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          letterSpacing: "0.18em",
                          color: "var(--brand-orange)",
                        }}
                      >
                        SC. {String(scene.scene_number).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-medium flex-1" style={{ color: "var(--brand-white)" }}>
                        {editingSceneId === scene.id ? sceneEditState.location || scene.location : scene.location}
                      </span>
                      <div className="flex gap-2 flex-wrap justify-end items-center">
                        {scene.scene_type && scene.scene_type !== "real" && (
                          <span className="text-[9px] uppercase tracking-widest text-purple-400 border border-purple-800/40 px-2 py-0.5">
                            {scene.scene_type}
                          </span>
                        )}
                        {scene.time_of_day && (
                          <span className="text-[9px] uppercase tracking-widest px-2 py-0.5" style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}>
                            {scene.time_of_day}
                          </span>
                        )}
                        {scene.mood && (
                          <span className="text-[9px] uppercase tracking-widest px-2 py-0.5" style={{ color: "var(--brand-orange)", opacity: 0.75, border: "1px solid rgba(255,138,42,0.25)" }}>
                            {scene.mood}
                          </span>
                        )}
                        <button
                          onClick={() => editingSceneId === scene.id ? setEditingSceneId(null) : startSceneEdit(scene)}
                          className="text-[9px] uppercase tracking-widest px-2.5 py-1 transition-colors"
                          style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand-orange)"; e.currentTarget.style.borderColor = "rgba(255,138,42,0.4)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--brand-gray)"; e.currentTarget.style.borderColor = "var(--brand-steel)"; }}
                        >
                          {editingSceneId === scene.id ? "Close" : "Edit"}
                        </button>
                      </div>
                    </div>

                    {/* Inline scene edit panel */}
                    {editingSceneId === scene.id && (
                      <div className="px-5 py-5 space-y-4" style={{ borderBottom: "1px solid var(--brand-steel)", background: "rgba(255,138,42,0.03)" }}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "var(--brand-gray)" }}>Location</label>
                            <input
                              type="text"
                              value={sceneEditState.location}
                              onChange={(e) => setSceneEditState((s) => ({ ...s, location: e.target.value }))}
                              className="w-full px-3 py-2 text-xs focus:outline-none"
                              style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "var(--brand-gray)" }}>Time of Day</label>
                            <input
                              type="text"
                              value={sceneEditState.time_of_day}
                              onChange={(e) => setSceneEditState((s) => ({ ...s, time_of_day: e.target.value }))}
                              className="w-full px-3 py-2 text-xs focus:outline-none"
                              style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "var(--brand-gray)" }}>Mood / Atmosphere</label>
                            <input
                              type="text"
                              value={sceneEditState.mood}
                              onChange={(e) => setSceneEditState((s) => ({ ...s, mood: e.target.value }))}
                              className="w-full px-3 py-2 text-xs focus:outline-none"
                              style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "var(--brand-gray)" }}>Scene Type</label>
                            <select
                              value={sceneEditState.scene_type}
                              onChange={(e) => setSceneEditState((s) => ({ ...s, scene_type: e.target.value }))}
                              className="w-full px-3 py-2 text-xs focus:outline-none"
                              style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
                            >
                              {["real", "dream", "fantasy", "flashback", "montage"].map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "var(--brand-gray)" }}>Action Summary</label>
                          <textarea
                            value={sceneEditState.action_summary}
                            onChange={(e) => setSceneEditState((s) => ({ ...s, action_summary: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 text-xs focus:outline-none resize-none"
                            style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => saveScene(scene.id)}
                            disabled={savingScene}
                            className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-4 py-2 hover:bg-green-950/20 transition-colors disabled:opacity-40"
                          >
                            {savingScene ? "Saving..." : "Save Scene"}
                          </button>
                          <button
                            onClick={() => setEditingSceneId(null)}
                            className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
                            style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Scene body */}
                    <div className="px-5 py-4">
                      {scene.action_summary && editingSceneId !== scene.id && (
                        <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--brand-gray)" }}>
                          {scene.action_summary}
                        </p>
                      )}
                      <div className="flex gap-6 flex-wrap">
                        {scene.characters_present && scene.characters_present.length > 0 && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                              Characters
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                              {scene.characters_present.map((name, i) => (
                                <span key={i} className="text-[10px] px-2 py-0.5" style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {scene.props && scene.props.length > 0 && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                              Props
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                              {scene.props.map((prop, i) => (
                                <span key={i} className="text-[10px] px-2 py-0.5" style={{ color: "var(--brand-gray)", opacity: 0.7, border: "1px solid var(--brand-steel)" }}>
                                  {prop}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {scene.wardrobe && scene.wardrobe.length > 0 && (
                          <div>
                            <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                              Wardrobe
                            </p>
                            <div className="space-y-0.5">
                              {scene.wardrobe.map((w, i) => (
                                <p key={i} className="text-[10px]" style={{ color: "var(--brand-gray)", opacity: 0.7 }}>
                                  <span style={{ opacity: 0.8 }}>{w.character}:</span> {w.description}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── APPROVE GATE ──────────────────── */}
          <div
            className="mt-4 pt-10"
            style={{ borderTop: "1px solid var(--brand-steel)" }}
          >
            {canApprove ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
                    Phase Gate: Approve Film Bible
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                    Locking the bible advances the project to the AI Casting phase.
                  </p>
                </div>
                <button
                  onClick={approveBible}
                  disabled={approving}
                  className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-6 py-3 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                >
                  {approving ? "Approving..." : "Approve & Lock Bible →"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs text-green-500 uppercase tracking-widest flex items-center gap-2">
                  <span>✓</span> Film Bible Approved
                </p>
                <Link
                  href={`/projects/${id}/cast`}
                  className="text-xs uppercase tracking-widest px-6 py-3 transition-colors"
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

// ──────────────────────────────────────────
// Featured Character Card (Lead / Supporting)
// ──────────────────────────────────────────

interface FeaturedCharacterCardProps {
  char: CharacterWithHeadshot;
  isEditing: boolean;
  editState: EditState;
  saving: boolean;
  imageCache: Record<string, string>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditChange: (field: keyof EditState, val: string | boolean) => void;
}

function FeaturedCharacterCard({
  char, isEditing, editState, saving, imageCache, onStartEdit, onCancelEdit, onSave, onEditChange,
}: FeaturedCharacterCardProps) {
  const rs = ROLE_STYLE[char.role] || ROLE_STYLE.minor;
  const hasHeadshot = !!imageCache[`headshot-${char.id}`];

  return (
    <div
      style={{
        background: isEditing ? "rgba(255,138,42,0.03)" : "var(--brand-mid)",
        border: isEditing ? "1px solid rgba(255,138,42,0.35)" : "1px solid var(--brand-steel)",
        transition: "border-color 0.2s",
      }}
    >
      <div className={`flex gap-0 ${hasHeadshot ? "flex-col md:flex-row" : ""}`}>
        {/* Left: character info */}
        <div className="flex-1 p-7">
          {/* Role badge + edit button row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span
                className="text-[9px] uppercase tracking-widest px-3 py-1.5"
                style={{ color: rs.color, border: `1px solid ${rs.border}`, background: rs.bg }}
              >
                {char.role}
              </span>
              {char.voice_only && (
                <span className="text-[9px] uppercase tracking-widest px-2 py-1 text-purple-400 border border-purple-800/40">
                  Voice Only
                </span>
              )}
              {hasHeadshot && (
                <span
                  className="text-[9px] uppercase tracking-widest px-2 py-1"
                  style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.3)", background: "rgba(76,201,240,0.06)" }}
                >
                  Cast Locked
                </span>
              )}
            </div>
            {!isEditing && (
              <button
                onClick={onStartEdit}
                className="text-[9px] uppercase tracking-widest px-3 py-1.5 transition-colors"
                style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand-orange)"; e.currentTarget.style.borderColor = "rgba(255,138,42,0.4)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--brand-gray)"; e.currentTarget.style.borderColor = "var(--brand-steel)"; }}
              >
                Edit
              </button>
            )}
          </div>

          {/* Character name */}
          <h2
            style={{
              fontFamily: "'Bebas Neue', 'Barlow Condensed', 'Impact', sans-serif",
              fontSize: char.role === "lead" ? "clamp(2.5rem, 5vw, 4rem)" : "clamp(2rem, 4vw, 3rem)",
              lineHeight: 0.95,
              letterSpacing: "0.04em",
              color: "var(--brand-white)",
              marginBottom: "1.25rem",
            }}
          >
            {char.name.toUpperCase()}
          </h2>

          {/* Content: edit form or display */}
          {isEditing ? (
            <CharacterEditFields
              editState={editState}
              saving={saving}
              onSave={onSave}
              onCancel={onCancelEdit}
              onChange={onEditChange}
            />
          ) : (
            <div className="space-y-4">
              {char.description && !char.description.startsWith("No physical description") && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                    Physical Description
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                    {char.description}
                  </p>
                </div>
              )}
              {char.personality && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-gray)", opacity: 0.5 }}>
                    Personality
                  </p>
                  <p className="text-sm leading-relaxed italic" style={{ color: "var(--brand-gray)", opacity: 0.85 }}>
                    {char.personality}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: headshot image */}
        {hasHeadshot && (
          <div
            className="shrink-0 self-stretch"
            style={{
              width: "clamp(160px, 25%, 240px)",
              minHeight: "220px",
              borderLeft: "1px solid var(--brand-steel)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageCache[`headshot-${char.id}`]}
              alt={`${char.name} headshot`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center top",
                display: "block",
              }}
            />
            {/* Gradient overlay at bottom */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "50%",
                background: "linear-gradient(to top, var(--brand-mid) 0%, transparent 100%)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Character Edit Fields (shared)
// ──────────────────────────────────────────

interface CharacterEditFieldsProps {
  editState: EditState;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: keyof EditState, val: string | boolean) => void;
}

function CharacterEditFields({ editState, saving, onSave, onCancel, onChange }: CharacterEditFieldsProps) {
  return (
    <div className="space-y-5">
      {/* Role selector */}
      <div>
        <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Role</p>
        <div className="flex gap-1.5 flex-wrap">
          {["lead", "supporting", "minor", "extra", "mentioned"].map((r) => {
            const rs = ROLE_STYLE[r] || ROLE_STYLE.minor;
            const active = editState.role === r;
            return (
              <button
                key={r}
                onClick={() => onChange("role", r)}
                className="text-[9px] uppercase tracking-widest px-3 py-1.5 transition-colors"
                style={{
                  color: active ? rs.color : "var(--brand-gray)",
                  background: active ? rs.bg : "transparent",
                  border: `1px solid ${active ? rs.border : "var(--brand-steel)"}`,
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice only toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange("voice_only", !editState.voice_only)}
          className="w-8 h-4 rounded-full transition-colors relative"
          style={{ background: editState.voice_only ? "#7c3aed" : "var(--brand-steel)" }}
        >
          <span
            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
            style={{ transform: editState.voice_only ? "translateX(1rem)" : "translateX(0.125rem)" }}
          />
        </button>
        <span className="text-xs" style={{ color: "var(--brand-gray)" }}>Voice Only (V.O. / O.S. — never physically on screen)</span>
      </div>

      {/* Description */}
      <div>
        <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Physical Description</p>
        <textarea
          value={editState.description}
          onChange={(e) => onChange("description", e.target.value)}
          rows={4}
          className="w-full text-xs p-3 focus:outline-none resize-none leading-relaxed"
          style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-orange)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
          placeholder="Age, build, hair color, ethnicity, distinguishing features…"
        />
      </div>

      {/* Personality */}
      <div>
        <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Personality</p>
        <textarea
          value={editState.personality}
          onChange={(e) => onChange("personality", e.target.value)}
          rows={3}
          className="w-full text-xs p-3 focus:outline-none resize-none leading-relaxed"
          style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)", color: "var(--brand-white)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-orange)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--brand-steel)")}
          placeholder="Personality traits, demeanor, emotional arc…"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="text-[10px] uppercase tracking-widest px-5 py-2 transition-colors disabled:opacity-40 text-green-400 border border-green-800/50 hover:bg-green-950/30"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
          style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
