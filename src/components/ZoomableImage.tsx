"use client";

import { useEffect, useState } from "react";

/**
 * REALISM_NOTES_v5 #4 — click any image to expand it full-screen.
 *
 * Drop-in replacement for an <img>: renders the thumbnail inline, and on
 * click opens a full-viewport lightbox (dark backdrop, click/Esc to close,
 * caption + download). Works with base64 data URLs and HTTPS URLs alike.
 */
export default function ZoomableImage({
  src,
  alt,
  caption,
  className,
  style,
  thumbClassName,
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  style?: React.CSSProperties;
  /** class applied to the inline thumbnail <img> */
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the lightbox is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in ${thumbClassName || className || ""}`}
        style={style}
        title="Click to expand"
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-8 no-print"
          style={{ background: "rgba(5,12,20,0.92)", backdropFilter: "blur(4px)" }}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-5 text-2xl leading-none"
            style={{ color: "var(--brand-white, #fff)" }}
            aria-label="Close"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-lg cursor-zoom-out"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-3 flex items-center gap-4 text-[11px] uppercase tracking-widest"
            style={{ color: "var(--brand-gray, #9aa)" }}
          >
            {caption && <span>{caption}</span>}
            <a href={src} download className="underline" style={{ color: "var(--brand-cyan, #4cc9f0)" }}>
              Download
            </a>
          </div>
        </div>
      )}
    </>
  );
}
