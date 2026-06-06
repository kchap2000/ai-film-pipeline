"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import {
  PHASE_LABELS,
  PROJECT_ASPECT_RATIO_OPTIONS,
  aspectRatioLabel,
  normalizeProjectAspectRatio,
  type Project,
  type ProjectAspectRatio,
  type ProjectFile,
} from "@/lib/types";

interface HomeCharacter {
  id: string;
  name: string;
  description: string;
  role: string;
  personality: string;
  voice_only: boolean;
  approved_cast_id: string | null;
  approved_image: HomeImageSource | null;
  locked: boolean;
}

interface HomeImageSource {
  api_url: string;
  response_key: string;
}

interface HomeLocation {
  id: string;
  name: string;
  description: string;
  time_of_day: string;
  mood: string;
  approved_image: HomeImageSource | null;
  locked: boolean;
}

interface HomeScene {
  id: string;
  scene_number: number;
  location: string;
  time_of_day: string;
  scene_type: string;
  action_summary: string;
  mood: string;
  props: string[];
  characters_present: string[];
  approved_scout_image_url: string | null;
  panel_count: number;
  preview_image: HomeImageSource | null;
}

interface HomeDecision {
  id: string;
  decision_type: string;
  subject_type: string;
  status: "approved" | "rejected" | "needs_changes" | "commented";
  notes: string | null;
  created_at: string;
}

interface HomeJob {
  id: string;
  job_type: string;
  target_label: string;
  status: string;
  priority: string;
  prompt: string;
  created_at: string;
}

interface HomeActivity {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

interface HomeFrame {
  id: string;
  panel_id: string;
  status: string;
  aspect_ratio: string;
  image: HomeImageSource;
}

interface ProjectHomePayload {
  project: Project;
  files: ProjectFile[];
  bible: {
    premise: string;
    tone: string;
    world: string;
    themes: string[];
    visual_rules: string[];
  };
  characters: HomeCharacter[];
  locations: HomeLocation[];
  scenes: HomeScene[];
  frame_gallery: HomeFrame[];
  decisions: HomeDecision[];
  generation_jobs: HomeJob[];
  activity: HomeActivity[];
  counts: {
    files: number;
    characters: number;
    cast_locked: number;
    locations: number;
    locations_approved: number;
    scenes: number;
    storyboard_panels: number;
    first_frames: number;
    first_frames_approved: number;
    open_jobs: number;
    open_revisions: number;
  };
  next_action: {
    label: string;
    detail: string;
    href: string | null;
    action: string;
  };
}

function labelFor(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  if (mimeType === "text/plain") return "TXT";
  return "FILE";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusColor(status: string) {
  if (status === "approved" || status === "completed") return "#4ade80";
  if (status === "needs_changes" || status === "rejected" || status === "failed") return "var(--brand-orange)";
  if (status === "running") return "var(--brand-cyan)";
  return "var(--brand-gray)";
}

function fallbackInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function LazyProjectImage({
  source,
  alt = "",
  className,
}: {
  source: HomeImageSource | null;
  alt?: string;
  className?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    fetch(source.api_url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const value = data?.[source.response_key];
        if (!cancelled && typeof value === "string" && value.trim()) setImageUrl(value);
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!source || !imageUrl) return null;
  return <img src={imageUrl} alt={alt} className={className} />;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [home, setHome] = useState<ProjectHomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingAspectRatio, setSavingAspectRatio] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  const fetchHome = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/home`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load project home.");
      setHome(data);
      setNotes(data.project?.production_notes || "");
      setNotesDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project home.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHome();
  }, [fetchHome]);

  useEffect(() => {
    const token = searchParams.get("invite");
    if (!token) return;
    let cancelled = false;
    fetch(`/api/projects/${id}/collaborators/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setInviteStatus(res.ok ? "Invite accepted for this project." : data.error || "Invite could not be accepted.");
          fetchHome().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setInviteStatus("Invite could not be accepted.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchHome, id, searchParams]);

  const runExtraction = async () => {
    setExtracting(true);
    setExtractError(null);
    setExtractResult(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Extraction failed.");
      setExtractResult(`Film bible built from ${data.characters ?? 0} characters and ${data.scenes ?? 0} scenes.`);
      await fetchHome();
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const saveNotes = async () => {
    if (!home || !notesDirty || savingNotes) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_notes: notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save notes.");
      }
      await fetchHome();
    } finally {
      setSavingNotes(false);
    }
  };

  const saveAspectRatio = async (aspectRatio: ProjectAspectRatio) => {
    if (!home || home.project.aspect_ratio === aspectRatio || savingAspectRatio) return;
    setSavingAspectRatio(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect_ratio: aspectRatio }),
      });
      if (res.ok) await fetchHome();
    } finally {
      setSavingAspectRatio(false);
    }
  };

  const project = home?.project || null;
  const selectedAspectRatio = normalizeProjectAspectRatio(project?.aspect_ratio);
  const sourceReady = Boolean(home && home.files.length > 0);
  const extracted = Boolean(home && (home.characters.length > 0 || home.scenes.length > 0));
  const heroImage = useMemo(() => {
    if (!home) return null;
    return (
      home.frame_gallery[0]?.image ||
      home.scenes.find((scene) => scene.preview_image)?.preview_image ||
      home.locations.find((location) => location.approved_image)?.approved_image ||
      home.characters.find((character) => character.approved_image)?.approved_image ||
      null
    );
  }, [home]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Opening project home...
      </div>
    );
  }

  if (error || !home || !project) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p style={{ color: "#fca5a5" }}>{error || "Project not found"}</p>
          <Link href="/" className="text-xs mt-4 inline-block" style={{ color: "var(--brand-orange)" }}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pb-20" style={{ background: "var(--brand-navy)", color: "var(--brand-white)" }}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="mb-8">
          <Link href="/" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
            &larr; Dashboard
          </Link>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-stretch mb-10">
          <div className="min-h-[460px] flex flex-col justify-between py-2">
            <div>
              <p className="text-xs mb-4" style={{ color: "var(--brand-gray)" }}>
                {project.type === "client" && project.client_name ? project.client_name : "Personal Project"} / {aspectRatioLabel(selectedAspectRatio)}
              </p>
              <h1 className="text-5xl md:text-6xl font-black leading-[0.95] tracking-tight max-w-3xl" style={{ color: "var(--brand-white)" }}>
                {project.title}
              </h1>
              <p className="text-lg mt-6 max-w-2xl leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                {home.bible.premise}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="py-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Stage</p>
                <p className="text-sm mt-2" style={{ color: "var(--brand-orange)" }}>{PHASE_LABELS[project.phase_status]}</p>
              </div>
              <div className="py-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Characters</p>
                <p className="text-sm mt-2">{home.counts.cast_locked}/{home.counts.characters} locked</p>
              </div>
              <div className="py-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Scenes</p>
                <p className="text-sm mt-2">{home.counts.scenes} mapped</p>
              </div>
              <div className="py-4" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Frames</p>
                <p className="text-sm mt-2">{home.counts.first_frames_approved}/{home.counts.storyboard_panels} approved</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[460px] overflow-hidden" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            {heroImage ? (
              <LazyProjectImage source={heroImage} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-8 text-center" style={{ background: "linear-gradient(145deg, rgba(76,201,240,0.14), rgba(255,138,42,0.10))" }}>
                <div>
                  <p className="text-6xl font-black" style={{ color: "rgba(255,255,255,0.16)" }}>{fallbackInitials(project.title)}</p>
                  <p className="text-sm mt-4 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                    Visual references will fill this space as casting, locations, storyboards, and first frames are approved.
                  </p>
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-5" style={{ background: "linear-gradient(180deg, transparent, rgba(11,28,45,0.92))" }}>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>Next Decision</p>
              <h2 className="text-xl font-semibold mt-2">{home.next_action.label}</h2>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--brand-gray)" }}>{home.next_action.detail}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {home.next_action.href ? (
                  <Link href={home.next_action.href} className="text-[10px] uppercase tracking-widest px-4 py-2" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.45)" }}>
                    Open
                  </Link>
                ) : home.next_action.action === "extract" ? (
                  <button type="button" onClick={runExtraction} disabled={extracting || !sourceReady} className="text-[10px] uppercase tracking-widest px-4 py-2 disabled:opacity-50" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.45)" }}>
                    {extracting ? "Building..." : "Build Bible"}
                  </button>
                ) : null}
                <Link href={`/projects/${project.id}/review`} className="text-[10px] uppercase tracking-widest px-4 py-2" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}>
                  Review Workroom
                </Link>
              </div>
            </div>
          </div>
        </section>

        {inviteStatus && (
          <div className="mb-8 px-4 py-3 text-xs" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.3)", background: "rgba(76,201,240,0.06)" }}>
            {inviteStatus}
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-6 mb-10">
          <div className="p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Film Bible</h2>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--brand-gray)" }}>{home.bible.tone}</p>
              </div>
              <Link href={`/projects/${project.id}/bible`} className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                Open Bible
              </Link>
            </div>
            <div className="mt-6 space-y-5">
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>World</p>
                <p className="text-sm leading-relaxed">{home.bible.world}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>Visual Rules</p>
                <div className="space-y-2">
                  {home.bible.visual_rules.slice(0, 3).map((rule) => (
                    <p key={rule} className="text-sm leading-relaxed" style={{ color: "var(--brand-white)" }}>
                      {rule}
                    </p>
                  ))}
                </div>
              </div>
              {home.bible.themes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {home.bible.themes.map((theme) => (
                    <span key={theme} className="text-[10px] uppercase tracking-widest px-2.5 py-1" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.24)" }}>
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{sourceReady ? "Source Documents" : "Start Here"}</h2>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                  {sourceReady ? "The project source is loaded. Keep this area simple for clients and producers." : "Upload the script or treatment first. Everything else grows from that source."}
                </p>
              </div>
              {sourceReady && !extracted && (
                <button type="button" onClick={runExtraction} disabled={extracting} className="text-[10px] uppercase tracking-widest px-3 py-2 disabled:opacity-50" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}>
                  {extracting ? "Building..." : "Build Bible"}
                </button>
              )}
            </div>

            {home.files.length > 0 ? (
              <div className="space-y-2">
                {home.files.slice(0, 4).map((file) => (
                  <div key={file.id} className="flex items-center justify-between gap-4 px-3 py-3" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{file.file_name}</p>
                      <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>
                        {fileTypeLabel(file.file_type)} / {formatSize(file.file_size)}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>Loaded</span>
                  </div>
                ))}
              </div>
            ) : (
              <FileUpload projectId={project.id} onUploadComplete={fetchHome} />
            )}

            {sourceReady && (
              <div className="mt-5">
                <FileUpload projectId={project.id} onUploadComplete={fetchHome} />
              </div>
            )}
            {(extractError || extractResult) && (
              <p className="text-xs mt-4" style={{ color: extractError ? "#fca5a5" : "#4ade80" }}>
                {extractError || extractResult}
              </p>
            )}
          </div>
        </section>

        <section className="mb-10">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Visual Board</h2>
              <p className="text-sm mt-2" style={{ color: "var(--brand-gray)" }}>Characters, places, scenes, and frames at a glance.</p>
            </div>
            <Link href={`/projects/${project.id}/first-frames`} className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
              Open Frames
            </Link>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {home.characters.slice(0, 4).map((character) => (
                <Link key={character.id} href={`/projects/${project.id}/cast`} className="group min-h-[260px] overflow-hidden" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                  <div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--brand-navy)" }}>
                    {character.approved_image ? (
                      <LazyProjectImage source={character.approved_image} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-4xl font-black" style={{ color: "rgba(255,255,255,0.14)" }}>{fallbackInitials(character.name)}</div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">{character.name}</h3>
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: character.locked ? "#4ade80" : "var(--brand-gray)" }}>
                        {character.locked ? "Locked" : character.voice_only ? "Voice" : "Open"}
                      </span>
                    </div>
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{character.description || character.personality}</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {home.locations.slice(0, 2).map((location) => (
                <Link key={location.id} href={`/projects/${project.id}/locations`} className="group min-h-[260px] overflow-hidden" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                  <div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--brand-navy)" }}>
                    {location.approved_image ? (
                      <LazyProjectImage source={location.approved_image} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    ) : (
                      <div className="h-full flex items-center justify-center px-5 text-center text-sm" style={{ color: "var(--brand-gray)" }}>Location reference pending</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-semibold">{location.name}</h3>
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{location.description || location.mood}</p>
                  </div>
                </Link>
              ))}

              {home.scenes.slice(0, 2).map((scene) => (
                <Link key={scene.id} href={`/projects/${project.id}/scenes`} className="group min-h-[260px] overflow-hidden" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                  <div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--brand-navy)" }}>
                    {scene.preview_image ? (
                      <LazyProjectImage source={scene.preview_image} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    ) : (
                      <div className="h-full flex items-center justify-center px-5 text-center text-sm" style={{ color: "var(--brand-gray)" }}>Scene look pending</div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>Scene {scene.scene_number} / {scene.panel_count} panels</p>
                    <h3 className="text-base font-semibold mt-1">{scene.location || "Unplaced Scene"}</h3>
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{scene.action_summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {home.characters.length === 0 && home.locations.length === 0 && home.scenes.length === 0 && (
            <div className="p-8 text-center" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>The visual board appears after extraction starts building characters, locations, and scenes.</p>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6 mb-10">
          <div className="p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Decisions Needed</h2>
                <p className="text-sm mt-2" style={{ color: "var(--brand-gray)" }}>
                  Clear client-facing decisions, not pipeline internals.
                </p>
              </div>
              <Link href={`/projects/${project.id}/review`} className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                Review
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {home.decisions.length === 0 ? (
                <p className="text-sm leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                  No approvals or revision requests yet. As clients review casting, locations, storyboards, and frames, their decisions will appear here.
                </p>
              ) : (
                home.decisions.slice(0, 5).map((decision) => (
                  <div key={decision.id} className="py-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm">{labelFor(decision.decision_type)}</p>
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: statusColor(decision.status) }}>{decision.status.replace("_", " ")}</span>
                    </div>
                    {decision.notes && <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{decision.notes}</p>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-2xl font-semibold tracking-tight">Producer Console</h2>
            <p className="text-sm mt-2 mb-5" style={{ color: "var(--brand-gray)" }}>
              Technical state lives here, below the creative surface.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                ["Format", selectedAspectRatio],
                ["Jobs", `${home.counts.open_jobs} open`],
                ["Revisions", `${home.counts.open_revisions} open`],
                ["Activity", `${home.activity.length} recent`],
              ].map(([label, value]) => (
                <div key={label} className="p-3" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>{label}</p>
                  <p className="text-sm mt-2">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {PROJECT_ASPECT_RATIO_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => saveAspectRatio(option.value)}
                  disabled={savingAspectRatio}
                  className="px-3 py-2 text-left disabled:opacity-50"
                  style={{
                    background: selectedAspectRatio === option.value ? "rgba(255,138,42,0.08)" : "var(--brand-navy)",
                    border: selectedAspectRatio === option.value ? "1px solid rgba(255,138,42,0.45)" : "1px solid var(--brand-steel)",
                  }}
                >
                  <span className="block text-xs" style={{ color: selectedAspectRatio === option.value ? "var(--brand-orange)" : "var(--brand-white)" }}>{option.shortLabel}</span>
                  <span className="block text-[10px] mt-1" style={{ color: "var(--brand-gray)" }}>{option.description}</span>
                </button>
              ))}
            </div>

            <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-gray)" }}>
              Director Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setNotesDirty(true);
              }}
              onBlur={saveNotes}
              rows={4}
              className="w-full text-sm px-3 py-2 outline-none resize-y"
              style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
              placeholder="Project-level visual rules, tone, wardrobe, camera, or continuity constraints."
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                {savingNotes ? "Saving..." : notesDirty ? "Unsaved" : "Saved"}
              </span>
              <button type="button" onClick={saveNotes} disabled={!notesDirty || savingNotes} className="text-[10px] uppercase tracking-widest px-3 py-2 disabled:opacity-40" style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}>
                Save
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>Generation Queue</h2>
            {home.generation_jobs.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>No queued AI work. Regeneration requests from review or Project Brain will appear here.</p>
            ) : (
              <div className="space-y-3">
                {home.generation_jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="py-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm">{job.target_label}</p>
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: statusColor(job.status) }}>{job.status}</span>
                    </div>
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{job.prompt || labelFor(job.job_type)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>Recent Activity</h2>
            {home.activity.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {home.activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                    <p className="text-sm">{item.title}</p>
                    {item.body && <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--brand-gray)" }}>{item.body}</p>}
                    <p className="text-[10px] uppercase tracking-widest mt-2" style={{ color: "var(--brand-gray)" }}>{new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
