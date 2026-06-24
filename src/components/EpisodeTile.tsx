"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EpisodeStatus } from "@/lib/types";

export interface EpisodeTileData {
  id: string;
  title: string;
  episode_number: number | null;
  aspect_ratio?: string;
  status: EpisodeStatus;
}

const STAGE_COLOR: Record<string, string> = {
  ingested: "var(--brand-gray)",
  extracted: "var(--brand-gray)",
  cast: "var(--brand-steel)",
  storyboard: "var(--brand-cyan)",
  first_frames: "var(--brand-cyan)",
  clips: "var(--brand-orange)",
  assembled: "var(--brand-orange)",
  complete: "#46c46a",
};

/** Lazy-loads the episode thumbnail (no base64 in bulk — fetched per tile). */
function useThumbnail(projectId: string, frameId: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!frameId) return;
    let live = true;
    fetch(`/api/projects/${projectId}/first-frames/image?frame_id=${frameId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.image_url) setUrl(d.image_url); })
      .catch(() => {});
    return () => { live = false; };
  }, [projectId, frameId]);
  return url;
}

export default function EpisodeTile({ ep }: { ep: EpisodeTileData }) {
  const thumb = useThumbnail(ep.id, ep.status.thumbnailFrameId);
  const color = STAGE_COLOR[ep.status.stage] || "var(--brand-gray)";
  const epLabel = ep.episode_number != null ? `EP${String(ep.episode_number).padStart(2, "0")}` : "—";

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
         style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
      {/* Thumbnail (9:16-friendly 4:3 crop) */}
      <div className="relative w-full" style={{ aspectRatio: "16 / 10", background: "var(--brand-navy)" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={ep.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--brand-steel)" }}>
            {ep.status.stage === "ingested" ? "no frames yet" : "rendering…"}
          </div>
        )}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-widest"
             style={{ background: "rgba(0,0,0,0.6)", color: "var(--brand-white)" }}>
          {epLabel}
        </div>
        {ep.status.qaScore != null && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold"
               style={{ background: "rgba(0,0,0,0.6)", color: ep.status.qaScore >= 80 ? "#46c46a" : "var(--brand-orange)" }}>
            QA {Math.round(ep.status.qaScore)}
          </div>
        )}
        {ep.status.watchable && (
          <Link href={`/projects/${ep.id}/video/watch`}
                className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={{ background: "var(--brand-orange)", color: "#0B1C2D" }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M8 5v14l11-7z" /></svg>
            Watch
          </Link>
        )}
      </div>

      {/* Meta */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-white)" }}>{ep.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="text-[11px]" style={{ color: "var(--brand-gray)" }}>{ep.status.label}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--brand-steel)" }}>
          <div className="h-full rounded-full" style={{ width: `${ep.status.pct}%`, background: color }} />
        </div>
        <div className="flex items-center gap-3 mt-1">
          <Link href={`/projects/${ep.id}`} className="text-[11px] font-medium hover:opacity-80" style={{ color: "var(--brand-cyan)" }}>Open →</Link>
          {ep.status.watchable && (
            <Link href={`/projects/${ep.id}/video/watch`} className="text-[11px] font-medium hover:opacity-80" style={{ color: "var(--brand-gray)" }}>Screening room</Link>
          )}
        </div>
      </div>
    </div>
  );
}
