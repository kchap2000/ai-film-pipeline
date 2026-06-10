"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";
import DirectorChat from "@/components/DirectorChat";

interface Clip {
  id: string;
  panel_id: string;
  status: "pending" | "generating" | "completed" | "failed" | "approved";
  video_url: string | null;
  duration_seconds: number | null;
  model_used: string;
  motion_description: string | null;
  created_at: string;
}

interface PanelWithClips {
  id: string;
  scene_id: string;
  panel_number: number;
  shot_type: string;
  camera_angle: string;
  camera_movement: string;
  action_description: string;
  characters_in_shot: string[];
  duration_seconds: number;
  approved_first_frame_id: string | null;
  scene: { scene_number: number; location: string } | null;
  clips: Clip[];
}

export default function VideoClipsPage() {
  const { id } = useParams<{ id: string }>();
  const [panels, setPanels] = useState<PanelWithClips[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingPanel, setGeneratingPanel] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const cancelRef = useRef(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/video-clips`);
    if (res.ok) {
      const data = await res.json();
      setPanels(data.panels || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const bestClip = (panel: PanelWithClips): Clip | null => {
    const approved = panel.clips.find((c) => c.status === "approved");
    if (approved) return approved;
    const usable = panel.clips.filter((c) => c.status !== "failed");
    return usable.length > 0 ? usable[usable.length - 1] : panel.clips[panel.clips.length - 1] || null;
  };

  const generateAll = async () => {
    setGenerating(true);
    setGenError(null);
    cancelRef.current = false;
    const targets = panels.filter(
      (p) => p.approved_first_frame_id && !p.clips.some((c) => ["pending", "generating", "completed", "approved"].includes(c.status))
    );
    setGenProgress({ done: 0, total: targets.length });
    outer: for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) {
        setGenError("Generation cancelled by user.");
        break outer;
      }
      setGeneratingPanel(targets[i].id);
      try {
        const res = await fetch(`/api/projects/${id}/video-clips`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panel_id: targets[i].id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Clip generation failed");
      } catch (err) {
        console.error(err);
      }
      setGenProgress({ done: i + 1, total: targets.length });
      await fetchData();
    }
    setGeneratingPanel(null);
    setGenerating(false);
    setGenProgress(null);
  };

  const regenerateClip = async (panelId: string) => {
    setGeneratingPanel(panelId);
    setGenError(null);
    try {
      const res = await fetch(`/api/projects/${id}/video-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panel_id: panelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Regenerate failed");
      await fetchData();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingPanel(null);
    }
  };

  const approveClip = async (clipId: string) => {
    setApproving(clipId);
    try {
      await fetch(`/api/projects/${id}/video-clips`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, status: "approved" }),
      });
      await fetchData();
    } finally {
      setApproving(null);
    }
  };

  const assemble = async () => {
    setAssembling(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/projects/${id}/assembly`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Assembly failed");
      window.location.href = `/projects/${id}/video/watch`;
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
      setAssembling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Loading Video Clips…
      </div>
    );
  }

  const readyPanels = panels.filter((p) => p.approved_first_frame_id);
  const clipsWithVideo = panels.filter((p) => bestClip(p)?.video_url);
  const approvedClips = panels.filter((p) => p.clips.some((c) => c.status === "approved"));
  const pendingExternal = panels.flatMap((p) => p.clips).filter((c) => c.status === "pending").length;

  return (
    <>
      <ProjectNav projectId={id} />
      <div className="min-h-screen pb-32" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link href={`/projects/${id}`} className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
              &larr; Back to Project
            </Link>
            <div className="flex items-end justify-between mt-4 gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                  Video Generation
                </h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  Phase 10 — each approved first frame becomes an animated clip.
                  {` ${clipsWithVideo.length}/${panels.length} have video · ${approvedClips.length} approved`}
                  {pendingExternal > 0 && ` · ${pendingExternal} awaiting Higgsfield fulfillment`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {generating && (
                  <button
                    onClick={() => { cancelRef.current = true; }}
                    className="text-xs uppercase tracking-widest px-5 py-2.5 text-red-400 border border-red-800/50 hover:bg-red-950/30 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={generateAll}
                  disabled={generating || readyPanels.length === 0}
                  className="text-xs uppercase tracking-widest px-5 py-2.5 text-green-400 border border-green-800/50 hover:bg-green-950/30 transition-colors disabled:opacity-30"
                >
                  {generating && genProgress ? `Generating ${genProgress.done}/${genProgress.total}…` : "Generate All Clips"}
                </button>
                {clipsWithVideo.length > 0 && (
                  <button
                    onClick={assemble}
                    disabled={assembling}
                    className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                    style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                  >
                    {assembling ? "Assembling…" : "Assemble & Watch →"}
                  </button>
                )}
              </div>
            </div>
          </header>

          {pendingExternal > 0 && (
            <div className="rounded-xl p-4 mb-6 text-xs" style={{ background: "rgba(255,138,42,0.05)", border: "1px solid rgba(255,138,42,0.25)", color: "var(--brand-gray)" }}>
              <span style={{ color: "var(--brand-orange)" }}>{pendingExternal} clip{pendingExternal === 1 ? "" : "s"} queued for external fulfillment.</span>{" "}
              No Higgsfield API key is configured, so these clips carry their full motion prompt and model selection and are fulfilled from a
              Cowork session with the Higgsfield connector (generate via MCP, then PATCH the video URL back). Set HIGGSFIELD_API_KEY +
              HIGGSFIELD_API_SECRET in Vercel to generate inline instead.
            </div>
          )}

          {genError && (
            <div className="rounded-md px-4 py-3 mb-6 text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
              {genError}
            </div>
          )}

          {panels.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}>
              <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>No storyboard panels yet</p>
              <Link href={`/projects/${id}/first-frames`} className="text-xs" style={{ color: "var(--brand-orange)" }}>
                &rarr; Go to First Frames
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {panels.map((panel) => {
                const clip = bestClip(panel);
                const isApproved = clip?.status === "approved";
                const isGenThis = generatingPanel === panel.id;
                return (
                  <div
                    key={panel.id}
                    className="rounded-xl overflow-hidden"
                    style={{
                      background: "var(--brand-mid)",
                      border: isApproved ? "1px solid rgba(34,197,94,0.4)" : "1px solid var(--brand-steel)",
                    }}
                  >
                    <div className="aspect-video flex items-center justify-center" style={{ background: "var(--brand-navy)" }}>
                      {clip?.video_url ? (
                        <video src={clip.video_url} controls loop muted className="w-full h-full object-cover" />
                      ) : isGenThis ? (
                        <div className="text-[10px] uppercase tracking-widest animate-pulse" style={{ color: "var(--brand-orange)" }}>Generating clip…</div>
                      ) : clip?.status === "pending" ? (
                        <div className="text-[10px] uppercase tracking-widest text-center px-6" style={{ color: "var(--brand-orange)" }}>
                          Queued for Higgsfield fulfillment
                        </div>
                      ) : clip?.status === "failed" ? (
                        <div className="text-[10px] uppercase tracking-widest text-red-400">Generation failed</div>
                      ) : !panel.approved_first_frame_id ? (
                        <div className="text-[10px] uppercase tracking-widest text-center px-6" style={{ color: "var(--brand-gray)" }}>
                          Approve a first frame before generating video
                        </div>
                      ) : (
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>No clip yet</div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                          {panel.scene ? `Scene ${panel.scene.scene_number}` : "Scene ?"} · Panel {String(panel.panel_number).padStart(2, "0")}
                        </span>
                        <div className="flex items-center gap-2">
                          {clip && (
                            <span className="text-[9px] uppercase tracking-widest px-2 py-0.5" style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}>
                              {clip.model_used}
                            </span>
                          )}
                          {isApproved && (
                            <span className="text-[9px] uppercase tracking-widest text-green-400 border border-green-800/50 px-2 py-0.5">Approved</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs mb-1" style={{ color: "var(--brand-white)" }}>{panel.action_description || "—"}</p>
                      <p className="text-[10px] mb-3" style={{ color: "var(--brand-gray)" }}>
                        {[panel.shot_type, panel.camera_movement, `${panel.duration_seconds || 5}s`].filter(Boolean).join(" · ")}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {clip?.video_url && !isApproved && (
                          <button
                            onClick={() => approveClip(clip.id)}
                            disabled={approving === clip.id}
                            className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-3 py-1.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                          >
                            {approving === clip.id ? "Approving…" : "Approve"}
                          </button>
                        )}
                        <button
                          onClick={() => regenerateClip(panel.id)}
                          disabled={isGenThis || generating || !panel.approved_first_frame_id}
                          className="text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors disabled:opacity-40"
                          style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                        >
                          {isGenThis ? "Working…" : clip ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <DirectorChat projectId={id} currentPage="video" />
    </>
  );
}
