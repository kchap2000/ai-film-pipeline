"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProjectNav from "@/components/ProjectNav";

interface Pose {
  id: string;
  pose_type: string;
  image_url: string;
}

interface LockCharacter {
  id: string;
  name: string;
  description: string;
  role: string;
  locked: boolean;
  approved_cast_id: string | null;
  approved_image_url: string | null;
  poses: Pose[];
}

const POSE_LABELS: Record<string, string> = {
  front: "Front",
  three_quarter: "3/4 View",
  profile: "Profile",
};

export default function CharacterLockPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [characters, setCharacters] = useState<LockCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [locking, setLocking] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/lock`);
    if (res.ok) {
      const data = await res.json();
      setCharacters(data.characters || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generatePoses = async (characterId?: string) => {
    setGenerating(true);
    await fetch(`/api/projects/${id}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(characterId ? { character_id: characterId } : {}),
    });
    await fetchData();
    setGenerating(false);
  };

  const lockAll = async () => {
    setLocking(true);
    await fetch(`/api/projects/${id}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock_all: true }),
    });
    await fetchData();
    setLocking(false);
  };

  const lockCharacter = async (characterId: string) => {
    await fetch(`/api/projects/${id}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character_id: characterId }),
    });
    await fetchData();
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm animate-pulse"
        style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}
      >
        Loading character lock data...
      </div>
    );
  }

  const castCharacters = characters.filter((c) => c.approved_cast_id !== null);
  const allHavePoses = castCharacters.every((c) => c.poses.length >= 3);
  const allLocked = castCharacters.every((c) => c.locked);
  const noCast = castCharacters.length === 0;

  return (
    <>
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
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
              Character Lock & Reference Poses
            </h1>
            <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
              {castCharacters.length} cast characters &middot; 3 reference poses each (front, 3/4, profile)
            </p>
          </div>
          <div className="flex gap-3">
            {!allHavePoses && !noCast && (
              <button
                onClick={() => generatePoses()}
                disabled={generating}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {generating ? "Generating Poses..." : "Generate All Poses"}
              </button>
            )}
            {allHavePoses && !allLocked && (
              <button
                onClick={lockAll}
                disabled={locking}
                className="text-xs uppercase tracking-widest text-green-400 border border-green-800/50 px-5 py-2.5 hover:bg-green-950/30 transition-colors disabled:opacity-40"
              >
                {locking ? "Locking..." : "Lock All Characters"}
              </button>
            )}
          </div>
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
        <div className="space-y-4">
          {castCharacters.map((char) => (
            <div
              key={char.id}
              className="rounded-xl p-6 transition-colors"
              style={{
                border: char.locked
                  ? "1px solid rgba(34,197,94,0.4)"
                  : "1px solid var(--brand-steel)",
                background: char.locked ? "rgba(34,197,94,0.04)" : "var(--brand-mid)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg" style={{ color: "var(--brand-white)" }}>{char.name}</h2>
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
                  <p className="text-xs mt-1 max-w-lg" style={{ color: "var(--brand-gray)" }}>
                    {char.description}
                  </p>
                </div>
                {!char.locked && char.poses.length >= 3 && (
                  <button
                    onClick={() => lockCharacter(char.id)}
                    className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-4 py-2 hover:bg-green-950/30 transition-colors"
                  >
                    Lock
                  </button>
                )}
                {!char.locked && char.poses.length < 3 && (
                  <button
                    onClick={() => generatePoses(char.id)}
                    disabled={generating}
                    className="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
                    style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,138,42,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {generating ? "Generating..." : "Generate Poses"}
                  </button>
                )}
              </div>

              {/* Pose Grid: Approved Cast + 3 Poses */}
              <div className="grid grid-cols-4 gap-3">
                {/* Approved casting headshot */}
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--brand-steel)" }}>
                  <div className="aspect-square" style={{ background: "var(--brand-navy)" }}>
                    {char.approved_image_url ? (
                      <img
                        src={char.approved_image_url}
                        alt={`${char.name} approved cast`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--brand-steel)" }}>
                        No image
                      </div>
                    )}
                  </div>
                  <p
                    className="text-[10px] uppercase tracking-widest text-center py-2"
                    style={{ color: "var(--brand-orange)", borderTop: "1px solid var(--brand-steel)" }}
                  >
                    Approved Cast
                  </p>
                </div>

                {/* Reference poses */}
                {(["front", "three_quarter", "profile"] as const).map((poseType) => {
                  const pose = char.poses.find((p) => p.pose_type === poseType);
                  return (
                    <div
                      key={poseType}
                      className="rounded-lg overflow-hidden"
                      style={{
                        border: pose ? "1px solid var(--brand-steel)" : "1px dashed var(--brand-steel)",
                        opacity: pose ? 1 : 0.6,
                      }}
                    >
                      <div className="aspect-square" style={{ background: "var(--brand-navy)" }}>
                        {pose ? (
                          <img
                            src={pose.image_url}
                            alt={`${char.name} ${POSE_LABELS[poseType]}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--brand-steel)" }}>
                            Pending
                          </div>
                        )}
                      </div>
                      <p
                        className="text-[10px] uppercase tracking-widest text-center py-2"
                        style={{ color: "var(--brand-gray)", borderTop: "1px solid var(--brand-steel)" }}
                      >
                        {POSE_LABELS[poseType]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Phase complete */}
      {allLocked && castCharacters.length > 0 && (
        <div className="mt-10 pt-8 flex items-center justify-between" style={{ borderTop: "1px solid var(--brand-steel)" }}>
          <div>
            <p className="text-sm text-green-400">All characters locked with reference poses</p>
            <p className="text-xs mt-1" style={{ color: "var(--brand-gray)" }}>
              Character identities are now canonical for all downstream generation.
            </p>
          </div>
          <Link
            href={`/projects/${id}`}
            className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors"
            style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,138,42,0.08)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            Continue &rarr;
          </Link>
        </div>
      )}
    </div>
    </div>
    </>
  );
}
