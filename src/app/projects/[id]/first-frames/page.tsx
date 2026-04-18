"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";
import { createClient } from "@/lib/supabase-browser";

// ─── Types ──────────────────────────────────────────────────────────

interface Frame {
  id: string;
  panel_id: string;
  status: "pending" | "approved" | "replaced";
  aspect_ratio: string;
  model_used: string;
  parent_frame_id: string | null;
  created_at: string;
}

interface PanelRow {
  id: string;
  scene_id: string;
  panel_number: number;
  shot_type: string;
  camera_angle: string;
  camera_movement: string;
  action_description: string;
  dialogue: string;
  characters_in_shot: string[];
  duration_seconds: number;
  approved_first_frame_id: string | null;
  frames: Frame[];
}

interface ReadinessCheck {
  done: number;
  total: number;
  ok: boolean;
}
interface Readiness {
  ready_for_first_frames: boolean;
  total_panels: number;
  checks: {
    characters_locked: ReadinessCheck;
    locations_approved: ReadinessCheck;
    scenes_scouted: ReadinessCheck;
    scenes_have_panels: ReadinessCheck;
  };
}

// ─── Client-side compression (same helper pattern as cast/lock pages) ─

async function compressImage(file: File, maxPx = 1920, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (Math.max(width, height) > maxPx) {
        const scale = maxPx / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2D context unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    img.src = objectUrl;
  });
}

// ─── Main page ──────────────────────────────────────────────────────

export default function FirstFramesPage() {
  const { id } = useParams<{ id: string }>();
  const [panels, setPanels] = useState<PanelRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [generatingPanel, setGeneratingPanel] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editAction, setEditAction] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPanelIdRef = useRef<string | null>(null);
  const cancelRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const [framesRes, readinessRes] = await Promise.all([
      fetch(`/api/projects/${id}/first-frames`),
      fetch(`/api/projects/${id}/readiness`),
    ]);
    if (framesRes.ok) {
      const data = await framesRes.json();
      setPanels(data.panels || []);
    }
    if (readinessRes.ok) {
      const data = await readinessRes.json();
      setReadiness(data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Lazy-load the approved (or most recent pending) frame image for each panel
  const fetchFrameImage = useCallback(
    async (frameId: string) => {
      const key = `frame-${frameId}`;
      if (imageCache[key] || loadingImages.has(key)) return;
      setLoadingImages((prev) => new Set(prev).add(key));
      try {
        const res = await fetch(`/api/projects/${id}/first-frames/image?frame_id=${frameId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.image_url) {
            setImageCache((prev) => ({ ...prev, [key]: data.image_url }));
          }
        }
      } catch {
        /* silent */
      } finally {
        setLoadingImages((prev) => {
          const n = new Set(prev);
          n.delete(key);
          return n;
        });
      }
    },
    [id, imageCache, loadingImages]
  );

  // Which frame should each panel display? Priority: approved → newest.
  const displayFrameFor = (panel: PanelRow): Frame | null => {
    if (panel.approved_first_frame_id) {
      return panel.frames.find((f) => f.id === panel.approved_first_frame_id) || null;
    }
    const active = panel.frames.filter((f) => f.status !== "replaced");
    if (active.length === 0) return null;
    return active[active.length - 1];
  };

  useEffect(() => {
    for (const p of panels) {
      const f = displayFrameFor(p);
      if (f) fetchFrameImage(f.id);
    }
  }, [panels, fetchFrameImage]);

  const generateAll = async () => {
    if (!readiness?.ready_for_first_frames) return;
    setGenerating(true);
    setGenError(null);
    cancelRef.current = false;

    // Target panels without an approved frame
    const targets = panels.filter((p) => !p.approved_first_frame_id);
    setGenProgress({ done: 0, total: targets.length });

    outer: for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) {
        setGenError("Generation cancelled by user.");
        break outer;
      }
      const panel = targets[i];
      setGeneratingPanel(panel.id);
      try {
        const res = await fetch(`/api/projects/${id}/first-frames`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panel_id: panel.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Panel ${panel.panel_number} failed`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Panel ${panel.panel_number}:`, msg);
      }
      setGenProgress({ done: i + 1, total: targets.length });
      // Refresh list so thumbnails appear live between panels
      await fetchAll();
    }
    setGeneratingPanel(null);
    setGenerating(false);
    setGenProgress(null);
  };

  const regeneratePanel = async (panelId: string) => {
    setGeneratingPanel(panelId);
    setGenError(null);
    try {
      const res = await fetch(`/api/projects/${id}/first-frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panel_id: panelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Regenerate failed");
      await fetchAll();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingPanel(null);
    }
  };

  const approveFrame = async (frameId: string) => {
    setApproving(frameId);
    try {
      await fetch(`/api/projects/${id}/first-frames`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_id: frameId, status: "approved" }),
      });
      await fetchAll();
    } finally {
      setApproving(null);
    }
  };

  const triggerUpload = (panelId: string) => {
    uploadPanelIdRef.current = panelId;
    fileInputRef.current?.click();
  };

  const startEdit = (panel: PanelRow) => {
    setEditingPanelId(panel.id);
    setEditAction(panel.action_description || "");
  };

  /**
   * Save the edited action description on the underlying storyboard_panel
   * (source of truth) and optionally regenerate the frame. Editing the
   * panel means both this phase AND Storyboard panel regens inherit the
   * new description next time they run.
   */
  const saveEditAndRegen = async (panelId: string, regenAfter: boolean) => {
    setSavingEdit(true);
    setGenError(null);
    try {
      const patchRes = await fetch(`/api/projects/${id}/storyboard`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panel_id: panelId, action_description: editAction }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        throw new Error(d.error || "Panel edit failed");
      }
      setEditingPanelId(null);
      await fetchAll();
      if (regenAfter) await regeneratePanel(panelId);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const panelId = uploadPanelIdRef.current;
    if (!file || !panelId) return;
    e.target.value = "";
    setUploadingFor(panelId);
    try {
      const compressed = await compressImage(file);
      const supabase = createClient();
      const storagePath = `first-frames/${id}/${panelId}/${Date.now()}.jpg`;
      const { error: storageErr } = await supabase.storage
        .from("project-uploads")
        .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: true });
      if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);
      const {
        data: { publicUrl },
      } = supabase.storage.from("project-uploads").getPublicUrl(storagePath);
      const res = await fetch(`/api/projects/${id}/first-frames`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panel_id: panelId, image_url: publicUrl, storage_path: storagePath }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload register failed");
      }
      await fetchAll();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingFor(null);
      uploadPanelIdRef.current = null;
    }
  };

  // ─── Render ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading First Frames…
      </div>
    );
  }

  const approvedCount = panels.filter((p) => p.approved_first_frame_id).length;
  const ready = readiness?.ready_for_first_frames ?? false;
  const totalPanels = panels.length;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <ProjectNav projectId={id} />
      <div className="min-h-screen pb-24" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Header */}
          <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link
              href={`/projects/${id}`}
              className="text-[10px] uppercase tracking-[0.25em]"
              style={{ color: "var(--brand-orange)" }}
            >
              &larr; Back to Project
            </Link>
            <div className="flex items-end justify-between mt-4 gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                  First Frames
                </h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  Photorealistic shoot-day reference frames, identity-locked to approved headshots and scene scouts.
                  {totalPanels > 0 && ` · ${approvedCount}/${totalPanels} approved`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {generating && (
                  <button
                    onClick={() => {
                      cancelRef.current = true;
                    }}
                    className="text-xs uppercase tracking-widest px-5 py-2.5 text-red-400 border border-red-800/50 hover:bg-red-950/30 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={generateAll}
                  disabled={!ready || generating || totalPanels === 0}
                  className="text-xs uppercase tracking-widest px-5 py-2.5 text-green-400 border border-green-800/50 hover:bg-green-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {generating && genProgress
                    ? `Generating ${genProgress.done}/${genProgress.total}…`
                    : ready
                    ? `Generate First Frames${totalPanels > 0 ? ` (${totalPanels})` : ""}`
                    : `Generate First Frames (not ready)`}
                </button>
              </div>
            </div>
          </header>

          {/* Readiness banner */}
          {readiness && !ready && (
            <div
              className="rounded-xl p-5 mb-8"
              style={{
                background: "rgba(255,138,42,0.04)",
                border: "1px solid rgba(255,138,42,0.25)",
              }}
            >
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--brand-orange)" }}>
                Pipeline not yet ready for First Frames
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs" style={{ color: "var(--brand-gray)" }}>
                <ReadinessRow label="Characters Locked" check={readiness.checks.characters_locked} />
                <ReadinessRow label="Locations Approved" check={readiness.checks.locations_approved} />
                <ReadinessRow label="Scenes Scouted" check={readiness.checks.scenes_scouted} />
                <ReadinessRow label="Scenes Have Panels" check={readiness.checks.scenes_have_panels} />
              </div>
            </div>
          )}

          {/* Error banner */}
          {genError && (
            <div
              className="rounded-md px-4 py-3 mb-6 text-xs"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5",
              }}
            >
              {genError}
            </div>
          )}

          {/* Panels grid */}
          {panels.length === 0 ? (
            <div
              className="rounded-xl p-12 text-center"
              style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
            >
              <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>
                No storyboard panels yet
              </p>
              <Link
                href={`/projects/${id}/storyboard`}
                className="text-xs transition-colors"
                style={{ color: "var(--brand-orange)" }}
              >
                &rarr; Go to Storyboard
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {panels.map((panel) => {
                const frame = displayFrameFor(panel);
                const frameImg = frame ? imageCache[`frame-${frame.id}`] : null;
                const isApproved = !!panel.approved_first_frame_id;
                const isGenThis = generatingPanel === panel.id;
                const isUploading = uploadingFor === panel.id;
                return (
                  <div
                    key={panel.id}
                    className="rounded-xl overflow-hidden"
                    style={{
                      background: "var(--brand-mid)",
                      border: isApproved ? "1px solid rgba(34,197,94,0.4)" : "1px solid var(--brand-steel)",
                    }}
                  >
                    {/* Frame image / placeholder */}
                    <div
                      className="aspect-video flex items-center justify-center"
                      style={{ background: "var(--brand-navy)" }}
                    >
                      {frameImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={frameImg} alt={`Panel ${panel.panel_number}`} className="w-full h-full object-cover" />
                      ) : frame ? (
                        <div className="text-[10px] uppercase tracking-widest animate-pulse" style={{ color: "var(--brand-gray)" }}>
                          Loading frame…
                        </div>
                      ) : isGenThis ? (
                        <div className="text-[10px] uppercase tracking-widest animate-pulse" style={{ color: "var(--brand-orange)" }}>
                          Generating…
                        </div>
                      ) : (
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                          Not generated yet
                        </div>
                      )}
                    </div>

                    {/* Metadata + actions */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-[10px] uppercase tracking-widest"
                          style={{ color: "var(--brand-orange)" }}
                        >
                          Panel {String(panel.panel_number).padStart(2, "0")}
                        </span>
                        {isApproved && (
                          <span className="text-[9px] uppercase tracking-widest text-green-400 border border-green-800/50 px-2 py-0.5">
                            Approved
                          </span>
                        )}
                      </div>

                      {editingPanelId === panel.id ? (
                        <div className="space-y-2 mb-3">
                          <label className="text-[9px] uppercase tracking-widest block" style={{ color: "var(--brand-gray)" }}>
                            Action description (edits the panel itself — source of truth)
                          </label>
                          <textarea
                            value={editAction}
                            onChange={(e) => setEditAction(e.target.value)}
                            rows={4}
                            className="w-full text-xs px-3 py-2 rounded-md outline-none resize-y"
                            style={{
                              background: "var(--brand-navy)",
                              color: "var(--brand-white)",
                              border: "1px solid var(--brand-steel)",
                            }}
                          />
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => saveEditAndRegen(panel.id, true)}
                              disabled={savingEdit}
                              className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-3 py-1.5 hover:bg-green-950/30 disabled:opacity-40"
                            >
                              {savingEdit ? "Saving…" : "Save & Regenerate"}
                            </button>
                            <button
                              onClick={() => saveEditAndRegen(panel.id, false)}
                              disabled={savingEdit}
                              className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                            >
                              Save Only
                            </button>
                            <button
                              onClick={() => setEditingPanelId(null)}
                              disabled={savingEdit}
                              className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs mb-2" style={{ color: "var(--brand-white)" }}>
                            {panel.action_description || <span style={{ opacity: 0.4 }}>No description</span>}
                          </p>
                          <p className="text-[10px] mb-3" style={{ color: "var(--brand-gray)" }}>
                            {[panel.shot_type, panel.camera_angle, panel.camera_movement].filter(Boolean).join(" · ") || "—"}
                          </p>

                          <div className="flex gap-2 flex-wrap">
                            {frame && !isApproved && (
                              <button
                                onClick={() => approveFrame(frame.id)}
                                disabled={approving === frame.id}
                                className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-3 py-1.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                              >
                                {approving === frame.id ? "Approving…" : "Approve"}
                              </button>
                            )}
                            <button
                              onClick={() => regeneratePanel(panel.id)}
                              disabled={isGenThis || generating}
                              className="text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors disabled:opacity-40"
                              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                            >
                              {isGenThis ? "Working…" : frame ? "Regenerate" : "Generate"}
                            </button>
                            <button
                              onClick={() => startEdit(panel)}
                              disabled={isGenThis || generating}
                              className="text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors disabled:opacity-40"
                              style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                            >
                              Edit Prompt
                            </button>
                            <button
                              onClick={() => triggerUpload(panel.id)}
                              disabled={isUploading}
                              className="text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors disabled:opacity-40"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                            >
                              {isUploading ? "Uploading…" : "Upload Replace"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completion celebration */}
          {totalPanels > 0 && approvedCount === totalPanels && (
            <div
              className="mt-12 rounded-xl p-8 text-center"
              style={{
                background: "rgba(34,197,94,0.06)",
                border: "1px solid rgba(34,197,94,0.4)",
              }}
            >
              <p className="text-xs uppercase tracking-widest text-green-400 mb-2">Pipeline Complete</p>
              <p className="text-2xl font-bold mb-2" style={{ color: "var(--brand-white)" }}>
                All First Frames Approved
              </p>
              <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                {approvedCount} shoot-day reference frames ready. Export the deck from the storyboard page.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function ReadinessRow({ label, check }: { label: string; check: ReadinessCheck }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded"
      style={{
        background: check.ok ? "rgba(34,197,94,0.06)" : "var(--brand-navy)",
        border: check.ok ? "1px solid rgba(34,197,94,0.25)" : "1px solid var(--brand-steel)",
      }}
    >
      <span className="uppercase tracking-widest text-[9px]">{label}</span>
      <span style={{ color: check.ok ? "#4ade80" : "var(--brand-gray)" }}>
        {check.done}/{check.total}
      </span>
    </div>
  );
}
