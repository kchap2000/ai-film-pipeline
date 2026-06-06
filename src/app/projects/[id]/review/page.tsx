"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { GenerationJob, Project } from "@/lib/types";

interface AutomationCheck {
  done: number;
  total: number;
  ok: boolean;
}

interface Automation {
  phase: string | null;
  targetPhase: string | null;
  checks: Record<string, AutomationCheck>;
}

interface ProjectDecision {
  id: string;
  decision_type: string;
  subject_type: string;
  subject_id: string;
  status: "approved" | "rejected" | "needs_changes" | "commented";
  notes: string | null;
  decided_by_email: string | null;
  created_at: string;
}

interface ProjectCollaborator {
  id: string;
  email: string;
  role_label: string;
  status: string;
}

interface ProjectActivity {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

const CHECK_REVIEW_LINKS: Record<string, string> = {
  cast_approved: "cast",
  cast_locked: "lock",
  locations_approved: "locations",
  scenes_scouted: "scenes",
  scenes_have_panels: "storyboard",
  first_frames_generated: "first-frames",
  first_frames_approved: "first-frames",
};

function labelFor(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusColor(status: string) {
  if (status === "approved" || status === "applied" || status === "completed") return "#4ade80";
  if (status === "needs_changes" || status === "rejected" || status === "failed") return "var(--brand-orange)";
  if (status === "running") return "var(--brand-cyan)";
  return "var(--brand-gray)";
}

export default function ReviewWorkroomPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<string | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<ProjectDecision["status"]>("approved");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);

  const fetchReview = useCallback(async () => {
    setError(null);
    try {
      const [projectRes, automationRes, decisionsRes, jobsRes, collaboratorsRes, activityRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/projects/${id}/automation`),
        fetch(`/api/projects/${id}/decisions`),
        fetch(`/api/projects/${id}/generation-jobs?limit=30`),
        fetch(`/api/projects/${id}/collaborators`),
        fetch(`/api/projects/${id}/activity`),
      ]);

      if (!projectRes.ok) throw new Error("Project not found or access denied.");
      const [projectData, automationData, decisionsData, jobsData, collaboratorsData, activityData] = await Promise.all([
        projectRes.json(),
        automationRes.ok ? automationRes.json() : Promise.resolve({}),
        decisionsRes.ok ? decisionsRes.json() : Promise.resolve({ decisions: [] }),
        jobsRes.ok ? jobsRes.json() : Promise.resolve({ jobs: [] }),
        collaboratorsRes.ok ? collaboratorsRes.json() : Promise.resolve({ collaborators: [] }),
        activityRes.ok ? activityRes.json() : Promise.resolve({ activity: [] }),
      ]);

      setProject(projectData.project || null);
      setAutomation(automationData.automation || null);
      setDecisions(decisionsData.decisions || []);
      setJobs(jobsData.jobs || []);
      setCollaborators(collaboratorsData.collaborators || []);
      setActivity(activityData.activity || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load review workroom.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  const checks = useMemo(() => Object.entries(automation?.checks || {}), [automation]);
  const blockedChecks = checks.filter(([, check]) => !check.ok);
  const openJobs = jobs.filter((job) => ["queued", "running", "failed"].includes(job.status));
  const revisionDecisions = decisions.filter((decision) => decision.status === "needs_changes" || decision.status === "rejected");
  const approvedDecisions = decisions.filter((decision) => decision.status === "approved");
  const topBlocker = blockedChecks[0] || null;
  const latestDecisionByType = useMemo(() => {
    const map = new Map<string, ProjectDecision>();
    for (const decision of decisions) {
      if (!map.has(decision.decision_type)) map.set(decision.decision_type, decision);
    }
    return map;
  }, [decisions]);

  const openDecision = (checkKey: string, nextStatus: ProjectDecision["status"]) => {
    setDecisionTarget(checkKey);
    setDecisionStatus(nextStatus);
    setDecisionNotes("");
    setDecisionMessage(null);
  };

  const submitDecision = async () => {
    if (!project || !decisionTarget || submittingDecision) return;
    setSubmittingDecision(true);
    setDecisionMessage(null);
    try {
      const res = await fetch(`/api/projects/${id}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision_type: decisionTarget,
          subject_type: "project_check",
          subject_id: project.id,
          status: decisionStatus,
          notes: decisionNotes,
          metadata: {
            source: "review_workroom",
            check_label: labelFor(decisionTarget),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not record decision.");
      setDecisionTarget(null);
      setDecisionNotes("");
      setDecisionMessage("Decision recorded.");
      await fetchReview();
    } catch (err) {
      setDecisionMessage(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Loading review workroom...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p style={{ color: "#fca5a5" }}>{error || "Project not found"}</p>
          <Link href={`/projects/${id}`} className="text-xs mt-4 inline-block" style={{ color: "var(--brand-orange)" }}>
            &larr; Back to Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: "var(--brand-navy)" }}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
          <Link href={`/projects/${id}`} className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
            &larr; Back to Project
          </Link>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mt-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--brand-cyan)" }}>
                Review Workroom
              </p>
              <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                {project.title}
              </h1>
              <p className="text-sm mt-3 max-w-2xl leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                Current review state, blockers, decisions, collaborators, and queued generation work in one place.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchReview}
              className="text-xs uppercase tracking-widest px-4 py-2"
              style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Primary Blocker</p>
            <p className="text-sm mt-2 capitalize" style={{ color: topBlocker ? "var(--brand-orange)" : "#4ade80" }}>
              {topBlocker ? labelFor(topBlocker[0]) : "No blockers"}
            </p>
          </div>
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Decisions</p>
            <p className="text-sm mt-2" style={{ color: revisionDecisions.length > 0 ? "var(--brand-orange)" : "var(--brand-white)" }}>
              {approvedDecisions.length} approved · {revisionDecisions.length} revisions
            </p>
          </div>
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Generation Queue</p>
            <p className="text-sm mt-2" style={{ color: openJobs.length > 0 ? "var(--brand-orange)" : "var(--brand-white)" }}>
              {openJobs.length > 0 ? `${openJobs.length} open` : "Clear"}
            </p>
          </div>
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>Collaborators</p>
            <p className="text-sm mt-2" style={{ color: "var(--brand-white)" }}>
              {collaborators.length} invited
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-6 mb-8">
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Review Checklist
            </h2>
            {decisionMessage && (
              <p className="mb-4 text-xs" style={{ color: decisionMessage.includes("Could") || decisionMessage.includes("disabled") ? "#fca5a5" : "var(--brand-cyan)" }}>
                {decisionMessage}
              </p>
            )}
            {checks.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>Automation checks are still loading.</p>
            ) : (
              <div className="space-y-3">
                {checks.map(([key, check]) => {
                  const href = CHECK_REVIEW_LINKS[key] ? `/projects/${id}/${CHECK_REVIEW_LINKS[key]}` : `/projects/${id}`;
                  const latestDecision = latestDecisionByType.get(key);
                  return (
                    <div key={key} className="py-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] md:items-center gap-4">
                        <div>
                          <p className="text-sm" style={{ color: check.ok ? "var(--brand-white)" : "var(--brand-orange)" }}>
                            {labelFor(key)}
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
                            {check.done} of {check.total} complete
                          </p>
                          {latestDecision && (
                            <p className="text-xs mt-1" style={{ color: statusColor(latestDecision.status) }}>
                              Latest decision: {latestDecision.status.replace("_", " ")}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: check.ok ? "#4ade80" : "var(--brand-orange)" }}>
                          {check.ok ? "Ready" : "Open"}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Link href={href} className="text-[10px] uppercase tracking-widest px-3 py-2" style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.28)" }}>
                            Review
                          </Link>
                          <button
                            type="button"
                            onClick={() => openDecision(key, check.ok ? "approved" : "needs_changes")}
                            className="text-[10px] uppercase tracking-widest px-3 py-2"
                            style={{ color: check.ok ? "#4ade80" : "var(--brand-orange)", border: check.ok ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,138,42,0.35)" }}
                          >
                            {check.ok ? "Approve" : "Request Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDecision(key, "commented")}
                            className="text-[10px] uppercase tracking-widest px-3 py-2"
                            style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                          >
                            Comment
                          </button>
                        </div>
                      </div>
                      {decisionTarget === key && (
                        <div className="mt-4 p-4" style={{ background: "var(--brand-navy)", border: "1px solid var(--brand-steel)" }}>
                          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                            <label className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                              Decision
                              <select
                                value={decisionStatus}
                                onChange={(event) => setDecisionStatus(event.target.value as ProjectDecision["status"])}
                                className="mt-1 w-full px-3 py-2 text-sm normal-case tracking-normal outline-none"
                                style={{ background: "var(--brand-mid)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                              >
                                <option value="approved">Approved</option>
                                <option value="needs_changes">Needs Changes</option>
                                <option value="rejected">Rejected</option>
                                <option value="commented">Commented</option>
                              </select>
                            </label>
                            <label className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                              Notes
                              <textarea
                                value={decisionNotes}
                                onChange={(event) => setDecisionNotes(event.target.value)}
                                rows={3}
                                className="mt-1 w-full px-3 py-2 text-sm normal-case tracking-normal outline-none resize-y"
                                style={{ background: "var(--brand-mid)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                                placeholder="Add approval notes or requested changes."
                              />
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={submitDecision}
                              disabled={submittingDecision}
                              className="text-[10px] uppercase tracking-widest px-3 py-2 disabled:opacity-50"
                              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                            >
                              {submittingDecision ? "Recording..." : "Record Decision"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDecisionTarget(null)}
                              disabled={submittingDecision}
                              className="text-[10px] uppercase tracking-widest px-3 py-2 disabled:opacity-50"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Generation Queue
            </h2>
            {jobs.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                No generation jobs yet. Regeneration requests from Project Brain will appear here before producer approval.
              </p>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 8).map((job) => (
                  <div key={job.id} className="pb-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm truncate" style={{ color: "var(--brand-white)" }}>{job.target_label}</p>
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: statusColor(job.status) }}>
                        {job.status}
                      </span>
                    </div>
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--brand-gray)" }}>
                      {job.prompt || labelFor(job.job_type)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Decision Trail
            </h2>
            {decisions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                No client approvals or revision requests have been recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {decisions.slice(0, 10).map((decision) => (
                  <div key={decision.id} className="pb-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm capitalize" style={{ color: "var(--brand-white)" }}>
                        {labelFor(decision.decision_type)} · {labelFor(decision.subject_type)}
                      </p>
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: statusColor(decision.status) }}>
                        {decision.status.replace("_", " ")}
                      </span>
                    </div>
                    {decision.notes && (
                      <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>{decision.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
            <h2 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "var(--brand-gray)" }}>
              Recent Project Activity
            </h2>
            {activity.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--brand-gray)" }}>No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {activity.slice(0, 10).map((item) => (
                  <div key={item.id} className="pb-3" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
                    <p className="text-sm" style={{ color: "var(--brand-white)" }}>{item.title}</p>
                    {item.body && <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>{item.body}</p>}
                    <p className="text-[10px] mt-2 uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
