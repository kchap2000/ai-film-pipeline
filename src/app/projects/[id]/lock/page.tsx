"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";
import { createClient } from "@/lib/supabase-browser";

// Same client-side compression as the cast page — keeps Storage payload small
// and avoids Vercel's 4.5 MB function payload limit (we go straight to Storage).
async function compressImage(file: File, maxPx = 1600, quality = 0.9): Promise<Blob> {
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
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };
    img.src = objectUrl;
  });
}

interface LockCharacter {
  id: string;
  name: string;
  description: string;
  role: string;
  locked: boolean;
  approved_cast_id: string | null;
  approved_variation_id: string | null;
}

export default function CharacterLockPage() {
  const { id } = useParams<{ id: string }>();
  const [characters, setCharacters] = useState<LockCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState<string | "all" | null>(null);
  const [generatingPoseSheet, setGeneratingPoseSheet] = useState<Set<string>>(new Set());
  const [poseSheetError, setPoseSheetError] = useState<Record<string, string>>({});
  const [placeholders, setPlaceholders] = useState<Set<string>>(new Set());
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCharIdRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/lock`);
    if (res.ok) {
      const data = await res.json();
      const chars: LockCharacter[] = data.characters || [];
      setCharacters(chars);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy-load headshot and pose sheet images
  const fetchCastImage = useCallback(async (key: string, url: string) => {
    if (imageCache[key] || loadingImages.has(key)) return;
    setLoadingImages((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const imgUrl = data.image_url || data.pose_sheet_url;
        if (imgUrl) {
          setImageCache((prev) => ({ ...prev, [key]: imgUrl }));
          // Detect SVG placeholder for pose sheets
          if (key.startsWith("pose-") && imgUrl.startsWith("data:image/svg+xml")) {
            const charId = key.replace("pose-", "");
            setPlaceholders((prev) => new Set(prev).add(charId));
          }
        }
      }
    } catch { /* silent */ } finally {
      setLoadingImages((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [imageCache, loadingImages]);

  // Fetch images for all cast characters
  useEffect(() => {
    for (const c of characters) {
      if (c.approved_variation_id) {
        fetchCastImage(`headshot-${c.id}`, `/api/projects/${id}/cast/image?variation_id=${c.approved_variation_id}`);
        fetchCastImage(`pose-${c.id}`, `/api/projects/${id}/cast/image?character_id=${c.id}&type=pose`);
      }
    }
  }, [characters, id, fetchCastImage]);

  // Auto-generate pose sheet for characters with headshot but no pose sheet
  useEffect(() => {
    if (characters.length === 0) return;
    const needs = characters.filter(
      (c) => c.approved_variation_id && !imageCache[`pose-${c.id}`] && !loadingImages.has(`pose-${c.id}`) && !generatingPoseSheet.has(c.id)
    );
    // Only trigger after we've checked the pose endpoint (image is loaded or missing)
    for (const char of needs) {
      // Check if we've already tried loading and got nothing
      if (imageCache[`pose-${char.id}`] === undefined && !loadingImages.has(`pose-${char.id}`)) continue;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters.map((c) => c.id + (c.approved_variation_id ? "1" : "0")).join(), imageCache]);

  const triggerPoseSheet = async (characterId: string) => {
    setGeneratingPoseSheet((prev) => new Set(prev).add(characterId));
    setPoseSheetError((prev) => { const n = { ...prev }; delete n[characterId]; return n; });

    try {
      const res = await fetch(`/api/projects/${id}/posesheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pose sheet generation failed");

      // Update image cache
      if (data.pose_sheet_url) {
        setImageCache((prev) => ({ ...prev, [`pose-${characterId}`]: data.pose_sheet_url }));
      }
      // Track placeholder status
      if (data.is_placeholder) {
        setPlaceholders((prev) => new Set(prev).add(characterId));
      } else {
        setPlaceholders((prev) => { const n = new Set(prev); n.delete(characterId); return n; });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setPoseSheetError((prev) => ({ ...prev, [characterId]: msg }));
    } finally {
      setGeneratingPoseSheet((prev) => {
        const n = new Set(prev);
        n.delete(characterId);
        return n;
      });
    }
  };

  // Open file picker for a specific character's reference sheet
  const triggerUpload = (characterId: string) => {
    uploadCharIdRef.current = characterId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const characterId = uploadCharIdRef.current;
    if (!file || !characterId) return;
    e.target.value = "";
    setUploadingFor(characterId);
    setPoseSheetError((prev) => { const n = { ...prev }; delete n[characterId]; return n; });

    try {
      const compressed = await compressImage(file);

      const supabase = createClient();
      const storagePath = `pose-sheets/${id}/${characterId}/sheet-${Date.now()}.jpg`;
      const { error: storageErr } = await supabase.storage
        .from("project-uploads")
        .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: true });
      if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

      const { data: { publicUrl } } = supabase.storage
        .from("project-uploads")
        .getPublicUrl(storagePath);

      const res = await fetch(`/api/projects/${id}/posesheet`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: characterId, storage_path: storagePath, image_url: publicUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

      // Optimistic: replace cached pose sheet image with the uploaded one,
      // and clear placeholder badge if it was set.
      setImageCache((prev) => ({ ...prev, [`pose-${characterId}`]: publicUrl }));
      setPlaceholders((prev) => { const n = new Set(prev); n.delete(characterId); return n; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setPoseSheetError((prev) => ({ ...prev, [characterId]: msg }));
    } finally {
      setUploadingFor(null);
      uploadCharIdRef.current = null;
    }
  };

  const lockCharacter = async (characterId: string) => {
    setLocking(characterId);
    await fetch(`/api/projects/${id}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character_id: characterId }),
    });
    await fetchData();
    setLocking(null);
  };

  const lockAll = async () => {
    setLocking("all");
    await fetch(`/api/projects/${id}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock_all: true }),
    });
    await fetchData();
    setLocking(null);
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading characters...
      </div>
    );
  }

  const castCharacters = characters.filter((c) => c.approved_cast_id !== null);
  const allLocked = castCharacters.length > 0 && castCharacters.every((c) => c.locked);
  const noCast = castCharacters.length === 0;

  return (
    <>
      {/* Hidden file input for reference sheet uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <ProjectNav projectId={id} />
      <div className="min-h-screen" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-6xl mx-auto px-6 py-12">

          {/* Header */}
          <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link
              href={`/projects/${id}`}
              className="text-[10px] uppercase tracking-[0.25em] transition-colors"
              style={{ color: "var(--brand-orange)" }}
            >
              &larr; Back to Project
            </Link>
            <div className="flex items-end justify-between mt-4">
              <div>
                <h1
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: "var(--brand-white)" }}
                >
                  Character Lock
                </h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  {castCharacters.length} cast{" "}
                  {castCharacters.length === 1 ? "character" : "characters"} &middot; approve
                  headshot &amp; reference sheet to lock
                </p>
              </div>
              {!allLocked && !noCast && (
                <button
                  onClick={lockAll}
                  disabled={locking === "all"}
                  className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-5 py-2.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                >
                  {locking === "all" ? "Locking..." : "Lock All"}
                </button>
              )}
            </div>
          </header>

          {noCast ? (
            <div
              className="rounded-xl p-12 text-center"
              style={{ border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}
            >
              <p className="text-sm mb-2" style={{ color: "var(--brand-gray)" }}>
                No characters have been cast yet
              </p>
              <Link
                href={`/projects/${id}/cast`}
                className="text-xs transition-colors"
                style={{ color: "var(--brand-orange)" }}
              >
                &rarr; Go to AI Casting
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {castCharacters.map((char) => {
                const isGenerating = generatingPoseSheet.has(char.id);
                const error = poseSheetError[char.id];

                return (
                  <div
                    key={char.id}
                    className="rounded-xl overflow-hidden transition-colors"
                    style={{
                      border: char.locked
                        ? "1px solid rgba(34,197,94,0.4)"
                        : "1px solid var(--brand-steel)",
                      background: char.locked ? "rgba(34,197,94,0.04)" : "var(--brand-mid)",
                    }}
                  >
                    {/* Card Header */}
                    <div
                      className="flex items-center justify-between px-6 py-4"
                      style={{ borderBottom: "1px solid var(--brand-steel)" }}
                    >
                      <div className="flex items-center gap-3">
                        <h2 className="text-base font-semibold" style={{ color: "var(--brand-white)" }}>
                          {char.name}
                        </h2>
                        <span
                          className="text-[10px] uppercase tracking-widest px-2 py-0.5"
                          style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                        >
                          {char.role}
                        </span>
                        {char.locked && (
                          <span className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-2 py-0.5 bg-green-950/30">
                            Locked
                          </span>
                        )}
                      </div>

                      {!char.locked && (
                        <button
                          onClick={() => lockCharacter(char.id)}
                          disabled={locking === char.id}
                          className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-4 py-2 hover:bg-green-950/30 transition-colors disabled:opacity-40"
                        >
                          {locking === char.id ? "Locking..." : "Lock Character"}
                        </button>
                      )}
                    </div>

                    {/* Headshot + Reference Sheet */}
                    <div className="grid grid-cols-[200px_1fr] gap-0">
                      {/* Approved Headshot — fixed-width column */}
                      <div style={{ borderRight: "1px solid var(--brand-steel)" }}>
                        <div className="aspect-[3/4] relative" style={{ background: "var(--brand-navy)" }}>
                          {imageCache[`headshot-${char.id}`] ? (
                            <img
                              src={imageCache[`headshot-${char.id}`]}
                              alt={`${char.name} approved cast`}
                              className="w-full h-full object-cover"
                            />
                          ) : loadingImages.has(`headshot-${char.id}`) ? (
                            <div className="w-full h-full animate-pulse rounded" style={{ background: "var(--brand-steel)" }} />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-xs"
                              style={{ color: "var(--brand-steel)" }}
                            >
                              No image
                            </div>
                          )}
                        </div>
                        <div
                          className="py-2 text-center text-[10px] uppercase tracking-widest"
                          style={{
                            borderTop: "1px solid var(--brand-steel)",
                            color: "var(--brand-orange)",
                          }}
                        >
                          Approved Cast
                        </div>
                      </div>

                      {/* Character Reference Sheet — fills remaining width */}
                      <div className="flex flex-col">
                        {imageCache[`pose-${char.id}`] ? (
                          <>
                            <div className="flex-1 relative" style={{ background: "var(--brand-navy)" }}>
                              <img
                                src={imageCache[`pose-${char.id}`]}
                                alt={`${char.name} character reference sheet`}
                                className="w-full h-full object-contain"
                                style={{ maxHeight: "400px" }}
                              />
                              {placeholders.has(char.id) && (
                                <div className="absolute top-3 right-3">
                                  <button
                                    onClick={() => triggerPoseSheet(char.id)}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
                                    style={{
                                      background: "rgba(255,138,42,0.9)",
                                      color: "#fff",
                                      backdropFilter: "blur(4px)",
                                    }}
                                  >
                                    {isGenerating ? "Regenerating..." : "Placeholder — Regenerate"}
                                  </button>
                                </div>
                              )}
                            </div>
                            <div
                              className="flex items-center justify-between px-4 py-2"
                              style={{ borderTop: "1px solid var(--brand-steel)" }}
                            >
                              <span
                                className="text-[10px] uppercase tracking-widest"
                                style={{ color: "var(--brand-gray)" }}
                              >
                                Character Reference Sheet
                              </span>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => triggerUpload(char.id)}
                                  disabled={uploadingFor === char.id}
                                  className="text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
                                  style={{ color: "var(--brand-cyan)" }}
                                >
                                  {uploadingFor === char.id ? "Uploading..." : "↑ Upload"}
                                </button>
                                <button
                                  onClick={() => triggerPoseSheet(char.id)}
                                  disabled={isGenerating}
                                  className="text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
                                  style={{ color: "var(--brand-orange)" }}
                                >
                                  {isGenerating ? "Regenerating..." : "Regenerate"}
                                </button>
                              </div>
                            </div>
                          </>
                        ) : isGenerating ? (
                          <div
                            className="flex-1 flex flex-col items-center justify-center gap-3"
                            style={{ minHeight: "200px" }}
                          >
                            <div
                              className="w-6 h-6 rounded-full border-2 animate-spin"
                              style={{
                                borderColor: "var(--brand-steel)",
                                borderTopColor: "var(--brand-orange)",
                              }}
                            />
                            <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                              Generating character reference sheet…
                            </p>
                          </div>
                        ) : error ? (
                          <div
                            className="flex-1 flex flex-col items-center justify-center gap-3 px-6"
                            style={{ minHeight: "200px" }}
                          >
                            <p className="text-xs text-center text-red-400">{error}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => triggerPoseSheet(char.id)}
                                className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
                                style={{
                                  color: "var(--brand-orange)",
                                  border: "1px solid rgba(255,138,42,0.4)",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "rgba(255,138,42,0.08)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "transparent")
                                }
                              >
                                Retry
                              </button>
                              <button
                                onClick={() => triggerUpload(char.id)}
                                disabled={uploadingFor === char.id}
                                className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
                                style={{
                                  color: "var(--brand-cyan)",
                                  border: "1px solid rgba(76,201,240,0.35)",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "rgba(76,201,240,0.08)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "transparent")
                                }
                              >
                                {uploadingFor === char.id ? "Uploading..." : "↑ Upload Sheet"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex-1 flex flex-col items-center justify-center gap-3"
                            style={{ minHeight: "200px" }}
                          >
                            <p className="text-xs" style={{ color: "var(--brand-gray)" }}>
                              No reference sheet yet
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => triggerPoseSheet(char.id)}
                                className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
                                style={{
                                  color: "var(--brand-orange)",
                                  border: "1px solid rgba(255,138,42,0.4)",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "rgba(255,138,42,0.08)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "transparent")
                                }
                              >
                                Generate Reference Sheet
                              </button>
                              <button
                                onClick={() => triggerUpload(char.id)}
                                disabled={uploadingFor === char.id}
                                className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
                                style={{
                                  color: "var(--brand-cyan)",
                                  border: "1px solid rgba(76,201,240,0.35)",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "rgba(76,201,240,0.08)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "transparent")
                                }
                              >
                                {uploadingFor === char.id ? "Uploading..." : "↑ Upload Sheet"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Spacer so the sticky bar never overlaps the last card */}
          {allLocked && castCharacters.length > 0 && <div className="h-24" />}
        </div>
      </div>

      {/* Sticky completion bar — always visible at viewport bottom when all locked,
          so the user doesn't have to scroll past tall reference sheets to find it. */}
      {allLocked && castCharacters.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md"
          style={{
            background: "rgba(11, 28, 45, 0.92)",
            borderTop: "1px solid rgba(34,197,94,0.35)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm text-green-400">All characters locked</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--brand-gray)" }}>
                Character identities are now canonical for all downstream generation.
              </p>
            </div>
            <Link
              href={`/projects/${id}/locations`}
              className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors flex-shrink-0"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              Continue to Location Scouting &rarr;
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
