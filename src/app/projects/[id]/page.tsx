"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Project,
  ProjectFile,
  PHASE_LABELS,
  PHASE_ORDER,
  PROJECT_ASPECT_RATIO_OPTIONS,
  aspectRatioLabel,
  type GenerationJob,
  normalizeProjectAspectRatio,
  type ProjectAspectRatio,
} from "@/lib/types";
import PhaseIndicator from "@/components/PhaseIndicator";
import FileUpload from "@/components/FileUpload";

interface ProjectReadiness {
  ready_for_first_frames: boolean;
  total_panels: number;
  checks: {
    characters_locked: { done: number; total: number; ok: boolean };
    locations_approved: { done: number; total: number; ok: boolean };
    scenes_scouted: { done: number; total: number; ok: boolean };
    scenes_have_panels: { done: number; total: number; ok: boolean };
  };
}

interface ProjectStaleness {
  available: boolean;
  summary: { stale_count: number; checked_count: number };
  by_asset_type: Record<string, unknown[]>;
}

interface ProjectAutomation {
  phase: string | null;
  targetPhase: string | null;
  checks: Record<string, { done: number; total: number; ok: boolean }>;
}

interface ProjectCollaborator {
  id: string;
  email: string;
  role: string;
  role_label: string;
  status: string;
  invite_url: string | null;
  created_at: string;
}

interface ProjectActivity {
  id: string;
  activity_type: string;
  title: string;
  body: string | null;
  actor_email: string | null;
  created_at: string;
}

interface ProjectDecision {
  id: string;
  decision_type: string;
  subject_type: string;
  subject_id: string;
  status: "approved" | "rejected" | "needs_changes" | "commented";
  notes: string | null;
  decided_by_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<{
    characters: number;
    scenes: number;
  } | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingAspectRatio, setSavingAspectRatio] = useState(false);
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [staleness, setStaleness] = useState<ProjectStaleness | null>(null);
  const [automation, setAutomation] = useState<ProjectAutomation | null>(null);
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("client");
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      const data = await res.json();
      setProject(data.project);
      setFiles(data.files || []);
      setNotes(data.project?.production_notes || "");
      setNotesDirty(false);
    }
    setLoading(false);
  }, [id]);

  const saveNotes = async () => {
    if (!notesDirty || savingNotes) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ production_notes: notes }),
      });
      if (res.ok) {
        setNotesDirty(false);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
      }
    } finally {
      setSavingNotes(false);
    }
  };

  const saveAspectRatio = async (aspectRatio: ProjectAspectRatio) => {
    if (!project || project.aspect_ratio === aspectRatio || savingAspectRatio) return;
    setSavingAspectRatio(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspect_ratio: aspectRatio }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject((prev) =>
          prev
            ? {
                ...prev,
                aspect_ratio: normalizeProjectAspectRatio(updated.aspect_ratio, aspectRatio),
                version: updated.version ?? prev.version,
              }
            : prev
        );
      }
    } finally {
      setSavingAspectRatio(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const fetchWorkspace = useCallback(async () => {
    const [collaboratorsRes, activityRes, automationRes, jobsRes, decisionsRes] = await Promise.all([
      fetch(`/api/projects/${id}/collaborators`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${id}/activity`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${id}/automation`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${id}/generation-jobs?limit=20`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${id}/decisions`).then((r) => (r.ok ? r.json() : null)),
    ]);
    setCollaborators(collaboratorsRes?.collaborators || []);
    setActivity(activityRes?.activity || []);
    if (automationRes?.automation) setAutomation(automationRes.automation);
    setGenerationJobs(jobsRes?.jobs || []);
    setDecisions(decisionsRes?.decisions || []);
  }, [id]);

  useEffect(() => {
    fetchWorkspace().catch(() => {});
  }, [fetchWorkspace]);

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
          fetchWorkspace().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setInviteStatus("Invite could not be accepted.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchWorkspace, id, searchParams]);

  // Load pipeline readiness once the project loads; shown as a compact tile
  // so Khalil can see what's blocking the next phase without visiting each
  // phase page. Silently no-ops if the endpoint 404s (old projects).
  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}/readiness`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${id}/staleness`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([readinessData, stalenessData]) => {
        if (readinessData && readinessData.checks) setReadiness(readinessData);
        if (stalenessData && stalenessData.summary) setStaleness(stalenessData);
      })
      .catch(() => {});
  }, [id]);

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

      // Guard against Vercel returning HTML on timeout/crash instead of JSON
      let data: { error?: string; characters?: number; scenes?: number } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 504 || res.status === 502
            ? "Extraction timed out — your document may be very large. Try a shorter script or split it into sections."
            : `Server error (${res.status}). Please try again.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "Extraction failed");
      }

      setExtractResult({
        characters: data.characters ?? 0,
        scenes: data.scenes ?? 0,
      });
      await fetchProject();
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Extraction failed"
      );
    } finally {
      setExtracting(false);
    }
  };

  const inviteCollaborator = async () => {
    if (!inviteEmail.trim() || inviting) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Invite failed");
      setInviteResult(data.collaborator?.invite_url || "Invite created.");
      setInviteEmail("");
      await fetchWorkspace();
    } catch (err) {
      setInviteResult(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p style={{ color: "var(--brand-gray)" }}>Project not found</p>
          <Link href="/" className="text-xs mt-4 inline-block" style={{ color: "var(--brand-orange)" }}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const deleteFile = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      await fetch(`/api/projects/${id}/files?file_id=${fileId}`, {
        method: "DELETE",
      });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } finally {
      setDeletingFileId(null);
    }
  };

  const fileTypeLabel = (mimeType: string) => {
    if (mimeType === "application/pdf") return "PDF";
    if (mimeType.includes("wordprocessingml")) return "DOCX";
    if (mimeType === "text/plain") return "TXT";
    return "FILE";
  };

  const phaseIndex = PHASE_ORDER.indexOf(project.phase_status);
  const canExtract = files.length > 0;
  const hasExtracted = phaseIndex >= 1;
  const isClient = project.type === "client";
  const selectedAspectRatio = normalizeProjectAspectRatio(project.aspect_ratio);
  const currentPhaseLabel = PHASE_LABELS[project.phase_status];
  const automationChecks = automation?.checks ? Object.entries(automation.checks) : [];
  const blockedChecks = automationChecks.filter(([, check]) => !check.ok);
  const topBlockedCheck = blockedChecks[0];
  const queuedJobs = generationJobs.filter((job) => job.status === "queued");
  const runningJobs = generationJobs.filter((job) => job.status === "running");
  const failedJobs = generationJobs.filter((job) => job.status === "failed");
  const activeJobCount = queuedJobs.length + runningJobs.length + failedJobs.length;
  const approvedDecisionCount = decisions.filter((decision) => decision.status === "approved").length;
  const revisionDecisionCount = decisions.filter((decision) => decision.status === "needs_changes" || decision.status === "rejected").length;
  const latestDecision = decisions[0] || null;
  const decisionStatusLabel =
    revisionDecisionCount > 0
      ? `${revisionDecisionCount} revision request${revisionDecisionCount === 1 ? "" : "s"}`
      : decisions.length > 0
      ? `${approvedDecisionCount}/${decisions.length} approved`
      : "No decisions yet";
  const clientDecisionLabel = topBlockedCheck
    ? topBlockedCheck[0].replace(/_/g, " ")
    : project.phase_status === "first_frames"
    ? "Review and approve final first frames"
    : "Ready for the next automated step";
  const nextGuidance =
    files.length === 0
      ? {
          label: "Upload your script or treatment",
          detail: "Start by adding a PDF, DOCX, or TXT file. The app will use it to extract characters, locations, and scenes.",
          href: null,
        }
      : !hasExtracted
      ? {
          label: "Run extraction",
          detail: "Claude will read the uploaded documents and build the first film bible draft.",
          href: null,
        }
      : phaseIndex === 1
      ? {
          label: "Review the Film Bible",
          detail: "Clean up characters, scenes, structure, and production details before generating visuals.",
          href: `/projects/${project.id}/bible`,
        }
      : phaseIndex === 2
      ? {
          label: "Generate and approve casting",
          detail: "Choose approved headshots so downstream storyboards and first frames can lock identities.",
          href: `/projects/${project.id}/cast`,
        }
      : phaseIndex === 3
      ? {
          label: "Lock character references",
          detail: "Approve pose sheets so every later visual has a consistent identity source.",
          href: `/projects/${project.id}/lock`,
        }
      : phaseIndex === 4
      ? {
          label: "Scout and approve locations",
          detail: "Generate location references that become visual anchors for scene scouting and storyboard panels.",
          href: `/projects/${project.id}/locations`,
        }
      : phaseIndex === 5
      ? {
          label: "Scout scenes and build storyboards",
          detail: "Approve scene looks, then generate shot-by-shot storyboard panels in the selected delivery format.",
          href: `/projects/${project.id}/scenes`,
        }
      : phaseIndex === 6
      ? readiness === null
        ? {
            label: "Checking readiness",
            detail: "Reviewing locked characters, approved scouts, and storyboard panels before recommending the next step.",
            href: null,
          }
        : {
            label: readiness.ready_for_first_frames ? "Generate First Frames" : "Finish readiness checks",
            detail: readiness.ready_for_first_frames
              ? "Every required upstream asset is ready; generate final shoot-day reference frames next."
              : "First Frames need locked characters, approved locations, approved scene scouts, and storyboard panels.",
            href: readiness.ready_for_first_frames ? `/projects/${project.id}/first-frames` : `/projects/${project.id}/storyboard`,
          }
      : {
          label: "Approve final First Frames",
          detail: "Review generated frames, replace any weak shots, and approve the shoot-day reference deck.",
          href: `/projects/${project.id}/first-frames`,
        };

  return (
    <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="pb-8 mb-10" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.25em] transition-colors"
            style={{ color: "var(--brand-orange)" }}
          >
            &larr; Dashboard
          </Link>
          <div className="flex items-start justify-between mt-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                {project.title}
              </h1>
              <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                {project.type === "client" && project.client_name
                  ? `Client: ${project.client_name}`
                  : "Personal Project"}
                {" · "}
                {new Date(project.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <span
              className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full"
              style={{
                background: isClient ? "rgba(76,201,240,0.1)" : "rgba(255,138,42,0.1)",
                color: isClient ? "var(--brand-cyan)" : "var(--brand-orange)",
                border: isClient ? "1px solid rgba(76,201,240,0.2)" : "1px solid rgba(255,138,42,0.2)",
              }}
            >
              {project.type}
            </span>
          </div>
        </header>

        {/* Phase Status */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Pipeline Status
          </h2>
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: "var(--brand-orange)" }}>
                {PHASE_LABELS[project.phase_status]}
              </span>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                Phase {PHASE_ORDER.indexOf(project.phase_status) + 1} of {PHASE_ORDER.length}
              </span>
            </div>
            <PhaseIndicator status={project.phase_status} />
          </div>
        </section>

        {/* Client-facing command center */}
        <section className="mb-10">
          <div
            className="p-6 md:p-8"
            style={{
              background: "linear-gradient(135deg, rgba(76,201,240,0.10), rgba(255,138,42,0.08)), var(--brand-mid)",
              border: "1px solid var(--brand-steel)",
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8">
              <div>
                <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-orange)" }}>
                  Project Command Center
                </p>
                <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--brand-white)" }}>
                  {currentPhaseLabel}
                </h2>
                <p className="text-sm mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                  This workspace is now structured around decisions: invite collaborators, collect approvals, and let the pipeline move forward when every required choice is complete.
                </p>

                {inviteStatus && (
                  <div
                    className="mt-5 px-4 py-3 text-xs"
                    style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.3)", background: "rgba(76,201,240,0.06)" }}
                  >
                    {inviteStatus}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mt-6">
                  <div className="p-4" style={{ background: "rgba(11,28,45,0.7)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      Decision Needed
                    </p>
                    <p className="text-sm mt-2 capitalize" style={{ color: "var(--brand-white)" }}>
                      {clientDecisionLabel}
                    </p>
                  </div>
                  <div className="p-4" style={{ background: "rgba(11,28,45,0.7)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      Collaborators
                    </p>
                    <p className="text-sm mt-2" style={{ color: "var(--brand-white)" }}>
                      {collaborators.length} invited
                    </p>
                  </div>
                  <div className="p-4" style={{ background: "rgba(11,28,45,0.7)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      Decisions
                    </p>
                    <p className="text-sm mt-2" style={{ color: revisionDecisionCount > 0 ? "var(--brand-orange)" : "var(--brand-white)" }}>
                      {decisionStatusLabel}
                    </p>
                  </div>
                  <div className="p-4" style={{ background: "rgba(11,28,45,0.7)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      Generation Queue
                    </p>
                    <p className="text-sm mt-2" style={{ color: activeJobCount > 0 ? "var(--brand-orange)" : "var(--brand-white)" }}>
                      {activeJobCount > 0 ? `${activeJobCount} needs review` : "Clear"}
                    </p>
                  </div>
                  <div className="p-4" style={{ background: "rgba(11,28,45,0.7)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      Automation
                    </p>
                    <p className="text-sm mt-2" style={{ color: "var(--brand-white)" }}>
                      {automation?.targetPhase ? `Target: ${automation.targetPhase.replace("_", " ")}` : "Monitoring approvals"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                  Invite Reviewer
                </p>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                >
                  <option value="client">Client</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="producer">Producer</option>
                </select>
                <button
                  onClick={inviteCollaborator}
                  disabled={inviting || !inviteEmail.trim()}
                  className="w-full text-xs uppercase tracking-widest px-4 py-2.5 disabled:opacity-40"
                  style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                >
                  {inviting ? "Creating Invite..." : "Create Invite Link"}
                </button>
                {inviteResult && (
                  <textarea
                    readOnly
                    value={inviteResult}
                    rows={3}
                    className="w-full px-3 py-2 text-xs outline-none resize-none"
                    style={{ background: "var(--brand-navy)", color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.25)" }}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-10">
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Collaborators
            </h2>
            {collaborators.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                No collaborators invited yet. Create an invite link above for a client or reviewer.
              </p>
            ) : (
              <div className="space-y-3">
                {collaborators.map((collaborator) => (
                  <div key={collaborator.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--brand-white)" }}>
                        {collaborator.email}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>
                        {collaborator.role_label} · {collaborator.status}
                      </p>
                    </div>
                    {collaborator.invite_url && (
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-cyan)" }}>
                        Link Ready
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Client Decisions
            </h2>
            {decisions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                Approvals and change requests will appear here as clients review casting, locations, storyboards, and frames.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="px-2 py-2" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Approved</p>
                    <p className="mt-1" style={{ color: "#4ade80" }}>{approvedDecisionCount}</p>
                  </div>
                  <div className="px-2 py-2" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Revisions</p>
                    <p className="mt-1" style={{ color: revisionDecisionCount > 0 ? "var(--brand-orange)" : "var(--brand-white)" }}>{revisionDecisionCount}</p>
                  </div>
                </div>
                {latestDecision && (
                  <div className="pt-3" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase tracking-widest truncate" style={{ color: "var(--brand-cyan)" }}>
                        Latest
                      </p>
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: latestDecision.status === "approved" ? "#4ade80" : "var(--brand-orange)" }}>
                        {latestDecision.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs mt-2 capitalize" style={{ color: "var(--brand-white)" }}>
                      {latestDecision.decision_type.replace(/_/g, " ")} · {latestDecision.subject_type.replace(/_/g, " ")}
                    </p>
                    {latestDecision.notes && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--brand-gray)" }}>
                        {latestDecision.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                Generation Queue
              </h2>
              <Link
                href={`/projects/${id}/first-frames`}
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "var(--brand-orange)" }}
              >
                Review
              </Link>
            </div>
            {generationJobs.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                No queued generation work. Client and Project Brain regeneration requests will appear here before AI spend is approved.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="px-2 py-2" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Queued</p>
                    <p className="mt-1" style={{ color: "var(--brand-white)" }}>{queuedJobs.length}</p>
                  </div>
                  <div className="px-2 py-2" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Running</p>
                    <p className="mt-1" style={{ color: "var(--brand-cyan)" }}>{runningJobs.length}</p>
                  </div>
                  <div className="px-2 py-2" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Failed</p>
                    <p className="mt-1" style={{ color: failedJobs.length > 0 ? "#fca5a5" : "var(--brand-white)" }}>{failedJobs.length}</p>
                  </div>
                </div>
                {generationJobs.slice(0, 3).map((job) => (
                  <div key={job.id} className="pt-3" style={{ borderTop: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase tracking-widest truncate" style={{ color: "var(--brand-orange)" }}>
                        {job.target_label}
                      </p>
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: job.status === "failed" ? "#fca5a5" : "var(--brand-gray)" }}>
                        {job.status}
                      </span>
                    </div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--brand-white)" }}>
                      {job.prompt || job.job_type.replace(/_/g, " ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Automation Checks
            </h2>
            {automationChecks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                Loading automation status...
              </p>
            ) : (
              <div className="space-y-2">
                {automationChecks.map(([key, check]) => (
                  <div key={key} className="flex items-center justify-between gap-4 text-xs">
                    <span className="capitalize" style={{ color: check.ok ? "var(--brand-white)" : "var(--brand-gray)" }}>
                      {key.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: check.ok ? "#4ade80" : "var(--brand-orange)" }}>
                      {check.done}/{check.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {activity.length > 0 && (
          <section className="mb-10">
            <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Recent Activity
            </h2>
            <div className="space-y-2">
              {activity.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                  style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
                >
                  <div>
                    <p className="text-sm" style={{ color: "var(--brand-white)" }}>
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                        {item.body}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--brand-gray)" }}>
                    {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Project Setup */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Project Setup
          </h2>
          <div
            className="rounded-xl p-6 space-y-5"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            <div>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
                    Delivery format: {aspectRatioLabel(selectedAspectRatio)}
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                    Scene scouts, storyboard panels, and first frames use this ratio. Changing it later marks generated assets stale so you know what needs regeneration.
                  </p>
                </div>
                {savingAspectRatio && (
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                    Saving...
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PROJECT_ASPECT_RATIO_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => saveAspectRatio(option.value)}
                    disabled={savingAspectRatio}
                    className="px-3 py-2 text-left transition-colors disabled:opacity-50"
                    style={{
                      background:
                        selectedAspectRatio === option.value
                          ? "rgba(255,138,42,0.08)"
                          : "var(--brand-navy)",
                      border:
                        selectedAspectRatio === option.value
                          ? "1px solid rgba(255,138,42,0.45)"
                          : "1px solid var(--brand-steel)",
                    }}
                  >
                    <span
                      className="block text-xs font-medium"
                      style={{
                        color:
                          selectedAspectRatio === option.value
                            ? "var(--brand-orange)"
                            : "var(--brand-white)",
                      }}
                    >
                      {option.shortLabel}
                    </span>
                    <span className="block text-[10px] mt-1" style={{ color: "var(--brand-gray)" }}>
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className="p-4"
              style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}
            >
              <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-orange)" }}>
                Next best action
              </p>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
                    {nextGuidance.label}
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                    {nextGuidance.detail}
                  </p>
                </div>
                {nextGuidance.href && (
                  <Link
                    href={nextGuidance.href}
                    className="text-[10px] uppercase tracking-widest px-3 py-2 whitespace-nowrap"
                    style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                  >
                    Open
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* File Upload */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Project Documents
          </h2>

          {files.length > 0 && (
            <div
              className="mb-4 rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--brand-steel)" }}
            >
              {files.map((file, i) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--brand-steel)" : "none",
                    background: "var(--brand-mid)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{
                        color: "var(--brand-gray)",
                        border: "1px solid var(--brand-steel)",
                      }}
                    >
                      {fileTypeLabel(file.file_type)}
                    </span>
                    <span className="text-sm" style={{ color: "var(--brand-white)" }}>
                      {file.file_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--brand-gray)" }}>
                      {formatSize(file.file_size)}
                    </span>
                    <button
                      onClick={() => deleteFile(file.id)}
                      disabled={deletingFileId === file.id}
                      className="w-6 h-6 flex items-center justify-center rounded transition-colors disabled:opacity-40"
                      style={{ color: "var(--brand-gray)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "#f87171";
                        (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "var(--brand-gray)";
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                      title="Remove file"
                    >
                      {deletingFileId === file.id ? (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <FileUpload projectId={project.id} onUploadComplete={fetchProject} />
        </section>

        {/* Extraction */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            LLM Extraction
          </h2>
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            {extracting ? (
              <div className="text-center">
                <div className="text-sm animate-pulse mb-2" style={{ color: "var(--brand-orange)" }}>
                  Running extraction via Claude...
                </div>
                <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                  Analyzing documents for characters, scenes, and structure. This may take 30-60 seconds.
                </p>
              </div>
            ) : extractResult ? (
              <div className="text-center">
                <p className="text-green-400 text-sm mb-2">Extraction complete</p>
                <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                  Found {extractResult.characters} characters and {extractResult.scenes} scenes
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: "var(--brand-white)" }}>
                    {hasExtracted
                      ? "Extraction has been run. You can re-extract to update."
                      : "Extract characters, scenes, and structure from uploaded documents."}
                  </p>
                  {!canExtract && (
                    <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                      Upload at least one document first.
                    </p>
                  )}
                </div>
                <button
                  onClick={runExtraction}
                  disabled={!canExtract}
                  className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                  style={{
                    color: "var(--brand-orange)",
                    border: "1px solid rgba(255,138,42,0.4)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {hasExtracted ? "Re-Extract" : "Run Extraction"}
                </button>
              </div>
            )}

            {extractError && (
              <p className="text-red-400 text-xs px-4 py-3 mt-4" style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                {extractError}
              </p>
            )}
          </div>
        </section>

        {/* Production Notes — director-level style/continuity directive,
            injected into all downstream generation prompts. */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
            Production Notes
          </h2>
          <div
            className="rounded-xl p-6"
            style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}
          >
            <p className="text-xs mb-3" style={{ color: "var(--brand-gray)" }}>
              Any text here is prepended as a locked directive to storyboard, scene-scout, and
              location-scout image prompts. Use it for overrides like &ldquo;all scenes at night&rdquo;,
              &ldquo;2.39:1 anamorphic aspect&rdquo;, or &ldquo;character X always wears a red coat&rdquo;.
            </p>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesDirty(true);
                setNotesSaved(false);
              }}
              onBlur={saveNotes}
              rows={5}
              placeholder="e.g. All scenes shot at night. Cool blue/teal color grade throughout. 2.39:1 anamorphic aspect. Always render Rob in a charcoal peacoat."
              className="w-full text-sm px-3 py-2 rounded-md outline-none resize-y"
              style={{
                background: "var(--brand-navy)",
                color: "var(--brand-white)",
                border: "1px solid var(--brand-steel)",
                minHeight: 96,
              }}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                {savingNotes
                  ? "Saving..."
                  : notesDirty
                  ? "Unsaved — click outside or Save to persist"
                  : notesSaved
                  ? "Saved"
                  : notes
                  ? "Saved"
                  : "Empty"}
              </span>
              <button
                onClick={saveNotes}
                disabled={!notesDirty || savingNotes}
                className="text-xs uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  color: "var(--brand-orange)",
                  border: "1px solid rgba(255,138,42,0.4)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Save
              </button>
            </div>
          </div>
        </section>

        {/* Pipeline Readiness — only show once casting has begun, and
            only for projects past the extraction phase. Gives Khalil an
            at-a-glance view of what's blocking First Frames. */}
        {readiness && phaseIndex >= 3 && (
          <section className="mb-10">
            <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Pipeline Readiness
            </h2>
            <div
              className="rounded-xl p-5"
              style={{
                background: readiness.ready_for_first_frames
                  ? "rgba(34,197,94,0.05)"
                  : "var(--brand-mid)",
                border: readiness.ready_for_first_frames
                  ? "1px solid rgba(34,197,94,0.35)"
                  : "1px solid var(--brand-steel)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-xs font-medium"
                  style={{
                    color: readiness.ready_for_first_frames ? "#4ade80" : "var(--brand-white)",
                  }}
                >
                  {readiness.ready_for_first_frames
                    ? "Ready to generate First Frames"
                    : "Not yet ready for First Frames"}
                </span>
                {readiness.ready_for_first_frames && (
                  <Link
                    href={`/projects/${id}/first-frames`}
                    className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-3 py-1.5 hover:bg-green-950/30 transition-colors"
                  >
                    Go to First Frames &rarr;
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Characters Locked", c: readiness.checks.characters_locked },
                  { label: "Locations Approved", c: readiness.checks.locations_approved },
                  { label: "Scenes Scouted", c: readiness.checks.scenes_scouted },
                  { label: "Scenes Have Panels", c: readiness.checks.scenes_have_panels },
                ].map(({ label, c }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2 rounded"
                    style={{
                      background: c.ok ? "rgba(34,197,94,0.06)" : "var(--brand-navy)",
                      border: c.ok ? "1px solid rgba(34,197,94,0.25)" : "1px solid var(--brand-steel)",
                    }}
                  >
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      {label}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={{ color: c.ok ? "#4ade80" : "var(--brand-gray)" }}
                    >
                      {c.done}/{c.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Project Brain — provenance-backed stale asset detector. */}
        {staleness && phaseIndex >= 5 && (
          <section className="mb-10">
            <h2 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
              Project Brain
            </h2>
            <div
              className="rounded-xl p-5"
              style={{
                background:
                  staleness.summary.stale_count > 0
                    ? "rgba(255,138,42,0.06)"
                    : "var(--brand-mid)",
                border:
                  staleness.summary.stale_count > 0
                    ? "1px solid rgba(255,138,42,0.35)"
                    : "1px solid var(--brand-steel)",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
                    {staleness.available
                      ? staleness.summary.stale_count > 0
                        ? `${staleness.summary.stale_count} generated asset references changed sources`
                        : "Generated assets are current"
                      : "Project Brain schema pending"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                    {staleness.available
                      ? `${staleness.summary.checked_count} source links tracked across storyboard, scout, cast, and first-frame assets.`
                      : "Apply the Project Brain migration before relying on stale-asset tracking."}
                  </p>
                </div>
                {staleness.summary.stale_count > 0 && (
                  <span
                    className="text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full whitespace-nowrap"
                    style={{
                      color: "var(--brand-orange)",
                      border: "1px solid rgba(255,138,42,0.45)",
                    }}
                  >
                    Review regenerations
                  </span>
                )}
              </div>
              {staleness.summary.stale_count > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                  {Object.entries(staleness.by_asset_type).map(([assetType, items]) => (
                    <div
                      key={assetType}
                      className="px-3 py-2 rounded"
                      style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}
                    >
                      <p className="text-[9px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                        {assetType.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm mt-1" style={{ color: "var(--brand-orange)" }}>
                        {items.length}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Phase Links */}
        {(() => {
          // Determine which step is "next up" based on current phase
          const nextStep =
            phaseIndex === 1 ? "Film Bible" :
            phaseIndex === 2 ? "AI Casting" :
            phaseIndex === 3 ? "Character Lock" :
            phaseIndex === 4 ? "Location Scouting" :
            phaseIndex === 5 ? "Scene Scouting" :
            phaseIndex === 6 ? "Storyboard" :
            phaseIndex === 7 ? "First Frames" : null;

          return [
            { show: hasExtracted,   href: `/projects/${project.id}/bible`,     label: "Film Bible",        sub: "Review and edit characters, scenes, structure, and metadata extracted from your documents" },
            { show: hasExtracted,   href: `/projects/${project.id}/cast`,      label: "AI Casting",        sub: "Generate visual variations per character, upload real headshots, and approve your cast" },
            { show: phaseIndex >= 3, href: `/projects/${project.id}/lock`,     label: "Character Lock",    sub: "Approve each character's headshot and auto-generate a multi-angle reference sheet" },
            { show: phaseIndex >= 4, href: `/projects/${project.id}/locations`, label: "Location Scouting", sub: "Generate visual references for each location, approve and lock into the scene bible" },
            { show: phaseIndex >= 5, href: `/projects/${project.id}/scenes`,   label: "Scene Scouting",    sub: "Generate atmospheric mood images for each scene — approve the best visual reference per scene" },
            { show: phaseIndex >= 5, href: `/projects/${project.id}/storyboard`, label: "Storyboard",      sub: "Shot-by-shot panel generation using locked characters, locations, and approved scene references" },
            { show: phaseIndex >= 6, href: `/projects/${project.id}/first-frames`, label: "First Frames",  sub: "Photorealistic shoot-day reference frames — identity-locked to approved headshots and scene scouts" },
          ].map(({ show, href, label, sub }) => {
            if (!show) return null;
            const isNextUp = label === nextStep;
            return (
              <section key={label} className="mb-4">
                {isNextUp && (
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: "rgba(255,138,42,0.15)", color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.35)" }}
                    >
                      Next Up
                    </span>
                  </div>
                )}
                <Link href={href}>
                  <div
                    className="rounded-xl p-6 transition-all duration-200 cursor-pointer"
                    style={{
                      background: isNextUp ? "rgba(255,138,42,0.06)" : "var(--brand-mid)",
                      border: isNextUp ? "1px solid rgba(255,138,42,0.5)" : "1px solid var(--brand-steel)",
                      boxShadow: isNextUp ? "0 4px 24px rgba(255,138,42,0.08)" : "none",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(255,138,42,0.12)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = isNextUp ? "rgba(255,138,42,0.5)" : "var(--brand-steel)";
                      (e.currentTarget as HTMLElement).style.boxShadow = isNextUp ? "0 4px 24px rgba(255,138,42,0.08)" : "none";
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: isNextUp ? "var(--brand-orange)" : "var(--brand-white)" }}>
                          {label}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                          {sub}
                        </p>
                      </div>
                      <span className="text-lg ml-4" style={{ color: "var(--brand-orange)" }}>&rarr;</span>
                    </div>
                  </div>
                </Link>
              </section>
            );
          });
        })()}
      </div>
    </div>
  );
}
