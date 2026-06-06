"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BrainTargetButton from "@/components/BrainTargetButton";
import ProjectNav from "@/components/ProjectNav";
import type { WardrobeItem } from "@/lib/types";

interface CharacterRow {
  id: string;
  name: string;
  role: string;
  voice_only: boolean;
}

interface SceneRow {
  id: string;
  scene_number: number;
  location: string;
  characters_present: string[];
  wardrobe: Array<{ character?: string; description?: string }>;
}

interface WardrobeDraft {
  outfit_name: string;
  description: string;
  notes: string;
  locked: boolean;
}

function itemKey(characterId: string, sceneId: string) {
  return `${characterId}:${sceneId}`;
}

export default function WardrobePage() {
  const { id } = useParams<{ id: string }>();
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, WardrobeDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fetchWardrobe = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/wardrobe`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCharacters(data.characters || []);
      setScenes(data.scenes || []);
      setItems(data.items || []);
      setSelectedSceneId((prev) => prev || data.scenes?.[0]?.id || null);
    } else {
      setStatus(data.error || "Could not load wardrobe.");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchWardrobe();
  }, [fetchWardrobe]);

  const itemByCharacterScene = useMemo(() => {
    const map = new Map<string, WardrobeItem>();
    for (const item of items) map.set(itemKey(item.character_id, item.scene_id), item);
    return map;
  }, [items]);

  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) || scenes[0] || null;
  const visibleCharacters = useMemo(() => {
    if (!selectedScene) return [];
    const present = new Set((selectedScene.characters_present || []).map((name) => name.toLowerCase()));
    return characters.filter((character) => !character.voice_only && present.has(character.name.toLowerCase()));
  }, [characters, selectedScene]);

  const lockedCount = items.filter((item) => item.locked).length;
  const sceneItemCount = selectedScene
    ? visibleCharacters.filter((character) => itemByCharacterScene.has(itemKey(character.id, selectedScene.id))).length
    : 0;

  const draftFor = (characterId: string, sceneId: string) => {
    const key = itemKey(characterId, sceneId);
    const existing = itemByCharacterScene.get(key);
    return drafts[key] || {
      outfit_name: existing?.outfit_name || "",
      description: existing?.description || "",
      notes: existing?.notes || "",
      locked: existing?.locked || false,
    };
  };

  const updateDraft = (characterId: string, sceneId: string, patch: Partial<WardrobeDraft>) => {
    const key = itemKey(characterId, sceneId);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {
          outfit_name: itemByCharacterScene.get(key)?.outfit_name || "",
          description: itemByCharacterScene.get(key)?.description || "",
          notes: itemByCharacterScene.get(key)?.notes || "",
          locked: itemByCharacterScene.get(key)?.locked || false,
        }),
        ...patch,
      },
    }));
  };

  const saveItem = async (character: CharacterRow, scene: SceneRow, lockOverride?: boolean) => {
    const key = itemKey(character.id, scene.id);
    const draft = draftFor(character.id, scene.id);
    setSavingKey(key);
    setStatus(null);
    try {
      const res = await fetch(`/api/projects/${id}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_id: character.id,
          scene_id: scene.id,
          outfit_name: draft.outfit_name,
          description: draft.description,
          notes: draft.notes,
          locked: lockOverride ?? draft.locked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchWardrobe();
      setStatus(lockOverride ? "Wardrobe item locked." : "Wardrobe item saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  };

  const autoPopulate = async () => {
    setAutoPopulating(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/projects/${id}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_populate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Auto-populate failed");
      await fetchWardrobe();
      setStatus(`Created ${data.inserted || 0} wardrobe item${data.inserted === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Auto-populate failed");
    } finally {
      setAutoPopulating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm animate-pulse" style={{ background: "var(--brand-navy)", color: "var(--brand-gray)" }}>
        Loading wardrobe...
      </div>
    );
  }

  return (
    <>
      <ProjectNav projectId={id} />
      <div className="min-h-screen pb-24" style={{ background: "var(--brand-navy)" }}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          <header className="pb-8 mb-8" style={{ borderBottom: "1px solid var(--brand-steel)" }}>
            <Link href={`/projects/${id}`} className="text-[10px] uppercase tracking-[0.25em]" style={{ color: "var(--brand-orange)" }}>
              &larr; Back to Project
            </Link>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mt-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--brand-white)" }}>
                  Wardrobe
                </h1>
                <p className="text-xs mt-2" style={{ color: "var(--brand-gray)" }}>
                  {items.length} item{items.length === 1 ? "" : "s"} created · {lockedCount} locked
                </p>
              </div>
              <button
                onClick={autoPopulate}
                disabled={autoPopulating}
                className="text-xs uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
              >
                {autoPopulating ? "Building Plot..." : "Auto-Populate Plot"}
              </button>
            </div>
          </header>

          {status && (
            <div className="mb-6 px-4 py-3 text-xs" style={{ color: status.includes("failed") || status.includes("Could not") ? "#fca5a5" : "var(--brand-cyan)", border: "1px solid var(--brand-steel)", background: "var(--brand-mid)" }}>
              {status}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <aside className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "var(--brand-gray)" }}>
                Scenes
              </p>
              {scenes.map((scene) => {
                const active = scene.id === selectedScene?.id;
                return (
                  <button
                    key={scene.id}
                    onClick={() => setSelectedSceneId(scene.id)}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{
                      background: active ? "rgba(255,138,42,0.08)" : "var(--brand-mid)",
                      border: active ? "1px solid rgba(255,138,42,0.45)" : "1px solid var(--brand-steel)",
                    }}
                  >
                    <span className="block text-xs uppercase tracking-widest" style={{ color: active ? "var(--brand-orange)" : "var(--brand-white)" }}>
                      Scene {scene.scene_number}
                    </span>
                    <span className="block text-[11px] mt-1 truncate" style={{ color: "var(--brand-gray)" }}>
                      {scene.location || "No location"}
                    </span>
                  </button>
                );
              })}
            </aside>

            <main>
              {!selectedScene ? (
                <div className="p-10 text-center" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                  <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                    No scenes available.
                  </p>
                </div>
              ) : (
                <section>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                        Scene {selectedScene.scene_number}
                      </p>
                      <h2 className="text-2xl font-semibold mt-1" style={{ color: "var(--brand-white)" }}>
                        {selectedScene.location || "Untitled Location"}
                      </h2>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                      {sceneItemCount}/{visibleCharacters.length} items
                    </span>
                  </div>

                  {visibleCharacters.length === 0 ? (
                    <div className="p-8" style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)" }}>
                      <p className="text-sm" style={{ color: "var(--brand-gray)" }}>
                        No visible characters were extracted for this scene.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleCharacters.map((character) => {
                        const existing = itemByCharacterScene.get(itemKey(character.id, selectedScene.id));
                        const draft = draftFor(character.id, selectedScene.id);
                        const key = itemKey(character.id, selectedScene.id);
                        const isSaving = savingKey === key;
                        return (
                          <div key={character.id} className="p-5" style={{ background: "var(--brand-mid)", border: existing?.locked ? "1px solid rgba(34,197,94,0.35)" : "1px solid var(--brand-steel)" }}>
                            <div className="flex items-start justify-between gap-4 mb-4">
                              <div>
                                <p className="text-sm font-medium" style={{ color: "var(--brand-white)" }}>
                                  {character.name}
                                </p>
                                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--brand-gray)" }}>
                                  {existing?.locked ? "Locked" : existing ? "Draft" : "Not set"}
                                </p>
                              </div>
                              {existing && (
                                <BrainTargetButton
                                  label="Brain Note"
                                  targetType="outfit"
                                  targetId={existing.id}
                                  targetLabel={`${character.name} wardrobe · scene ${selectedScene.scene_number}`}
                                  phase="wardrobe"
                                  category="wardrobe"
                                  intent="feedback"
                                />
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-[0.45fr_1fr] gap-3">
                              <label className="block">
                                <span className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)" }}>
                                  Outfit Name
                                </span>
                                <input
                                  value={draft.outfit_name}
                                  onChange={(event) => updateDraft(character.id, selectedScene.id, { outfit_name: event.target.value })}
                                  className="w-full px-3 py-2 text-sm outline-none"
                                  style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                                />
                              </label>
                              <label className="block">
                                <span className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)" }}>
                                  Description
                                </span>
                                <textarea
                                  value={draft.description}
                                  onChange={(event) => updateDraft(character.id, selectedScene.id, { description: event.target.value })}
                                  rows={3}
                                  className="w-full px-3 py-2 text-sm outline-none resize-y"
                                  style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                                />
                              </label>
                            </div>

                            <label className="block mt-3">
                              <span className="block text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--brand-gray)" }}>
                                Notes
                              </span>
                              <textarea
                                value={draft.notes}
                                onChange={(event) => updateDraft(character.id, selectedScene.id, { notes: event.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 text-sm outline-none resize-y"
                                style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
                              />
                            </label>

                            <div className="flex flex-wrap items-center gap-2 mt-4">
                              <button
                                onClick={() => saveItem(character, selectedScene)}
                                disabled={isSaving}
                                className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                                style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
                              >
                                {isSaving ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => saveItem(character, selectedScene, true)}
                                disabled={isSaving || !draft.description.trim()}
                                className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                                style={{ color: "#4ade80", border: "1px solid rgba(34,197,94,0.45)" }}
                              >
                                Lock
                              </button>
                              {existing?.locked && (
                                <button
                                  onClick={() => saveItem(character, selectedScene, false)}
                                  disabled={isSaving}
                                  className="text-[10px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                                  style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                                >
                                  Unlock
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
