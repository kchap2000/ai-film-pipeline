"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
      <div className="max-w-6xl mx-auto px-6 py-12 text-neutral-500 text-sm animate-pulse">
        Loading character lock data...
      </div>
    );
  }

  const castCharacters = characters.filter((c) => c.approved_cast_id !== null);
  const allHavePoses = castCharacters.every((c) => c.poses.length >= 3);
  const allLocked = castCharacters.every((c) => c.locked);
  const noCast = castCharacters.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="border-b border-amber-900/25 pb-8 mb-8">
        <Link
          href={`/projects/${id}`}
          className="text-[10px] uppercase tracking-[0.25em] text-amber-600 hover:text-amber-400 transition-colors"
        >
          &larr; Back to Project
        </Link>
        <div className="flex items-end justify-between mt-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
              Character Lock & Reference Poses
            </h1>
            <p className="text-xs text-neutral-500 mt-2">
              {castCharacters.length} cast characters &middot; 3 reference poses
              each (front, 3/4, profile)
            </p>
          </div>
          <div className="flex gap-3">
            {!allHavePoses && !noCast && (
              <button
                onClick={() => generatePoses()}
                disabled={generating}
                className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
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
        <div className="border border-neutral-800 p-12 text-center">
          <p className="text-neutral-500 text-sm mb-2">
            No characters have been cast yet
          </p>
          <Link
            href={`/projects/${id}/cast`}
            className="text-xs text-amber-500 hover:text-amber-400"
          >
            &rarr; Go to AI Casting
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {castCharacters.map((char) => (
            <div
              key={char.id}
              className={`border p-6 transition-colors ${
                char.locked
                  ? "border-green-800/50 bg-green-950/5"
                  : "border-neutral-800"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg text-neutral-100">{char.name}</h2>
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500 border border-neutral-700 px-2 py-0.5">
                      {char.role}
                    </span>
                    {char.locked && (
                      <span className="text-[10px] uppercase tracking-widest text-green-400 border border-green-800/50 px-2 py-0.5 bg-green-950/30">
                        Locked
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 max-w-lg">
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
                    className="text-[10px] uppercase tracking-widest text-amber-500 border border-amber-800/50 px-4 py-2 hover:bg-amber-950/30 transition-colors disabled:opacity-40"
                  >
                    {generating ? "Generating..." : "Generate Poses"}
                  </button>
                )}
              </div>

              {/* Pose Grid: Approved Cast + 3 Poses */}
              <div className="grid grid-cols-4 gap-3">
                {/* Approved casting headshot */}
                <div className="border border-neutral-700">
                  <div className="aspect-square bg-neutral-900">
                    {char.approved_image_url ? (
                      <img
                        src={char.approved_image_url}
                        alt={`${char.name} approved cast`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                        No image
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-amber-600 text-center py-2 border-t border-neutral-700">
                    Approved Cast
                  </p>
                </div>

                {/* Reference poses */}
                {(["front", "three_quarter", "profile"] as const).map(
                  (poseType) => {
                    const pose = char.poses.find(
                      (p) => p.pose_type === poseType
                    );
                    return (
                      <div
                        key={poseType}
                        className={`border ${
                          pose ? "border-neutral-700" : "border-dashed border-neutral-800"
                        }`}
                      >
                        <div className="aspect-square bg-neutral-900">
                          {pose ? (
                            <img
                              src={pose.image_url}
                              alt={`${char.name} ${POSE_LABELS[poseType]}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-700 text-xs">
                              Pending
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 text-center py-2 border-t border-neutral-700">
                          {POSE_LABELS[poseType]}
                        </p>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Phase complete */}
      {allLocked && castCharacters.length > 0 && (
        <div className="mt-10 border-t border-amber-900/25 pt-8 flex items-center justify-between">
          <div>
            <p className="text-green-400 text-sm">
              All characters locked with reference poses
            </p>
            <p className="text-xs text-neutral-600 mt-1">
              Character identities are now canonical for all downstream
              generation.
            </p>
          </div>
          <Link
            href={`/projects/${id}`}
            className="text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-5 py-2.5 hover:bg-amber-950/30 transition-colors"
          >
            Continue &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
