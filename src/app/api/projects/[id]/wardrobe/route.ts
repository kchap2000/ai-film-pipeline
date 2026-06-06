import { getProjectAccess } from "@/lib/project-access";
import { createRouteClient } from "@/lib/supabase-route";
import { recordProjectActivity } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function nullableUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function wardrobeDescriptionFor(sceneWardrobe: unknown, characterName: string) {
  if (!Array.isArray(sceneWardrobe)) return "";
  const lowerName = characterName.toLowerCase();
  const item = sceneWardrobe.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as { character?: unknown; description?: unknown };
    return String(candidate.character || "").trim().toLowerCase() === lowerName;
  }) as { description?: unknown } | undefined;
  return text(item?.description);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const [charactersRes, scenesRes, itemsRes] = await Promise.all([
    supabase
      .from("characters")
      .select("id, name, role, voice_only")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("scenes")
      .select("id, scene_number, location, characters_present, wardrobe")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("wardrobe_items")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (charactersRes.error) return NextResponse.json({ error: charactersRes.error.message }, { status: 500 });
  if (scenesRes.error) return NextResponse.json({ error: scenesRes.error.message }, { status: 500 });
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });

  return NextResponse.json({
    access,
    characters: charactersRes.data || [],
    scenes: scenesRes.data || [],
    items: itemsRes.data || [],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canManage) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === "auto_populate") {
    const [charactersRes, scenesRes, existingRes] = await Promise.all([
      supabase
        .from("characters")
        .select("id, name, voice_only")
        .eq("project_id", id),
      supabase
        .from("scenes")
        .select("id, scene_number, characters_present, wardrobe")
        .eq("project_id", id),
      supabase
        .from("wardrobe_items")
        .select("character_id, scene_id")
        .eq("project_id", id),
    ]);

    if (charactersRes.error) return NextResponse.json({ error: charactersRes.error.message }, { status: 500 });
    if (scenesRes.error) return NextResponse.json({ error: scenesRes.error.message }, { status: 500 });
    if (existingRes.error) return NextResponse.json({ error: existingRes.error.message }, { status: 500 });

    const charactersByName = new Map(
      (charactersRes.data || [])
        .filter((character) => !character.voice_only)
        .map((character) => [String(character.name || "").trim().toLowerCase(), character])
    );
    const existing = new Set((existingRes.data || []).map((item) => `${item.character_id}:${item.scene_id}`));
    const rows = [];

    for (const scene of scenesRes.data || []) {
      for (const characterName of scene.characters_present || []) {
        const character = charactersByName.get(String(characterName || "").trim().toLowerCase());
        if (!character) continue;
        const key = `${character.id}:${scene.id}`;
        if (existing.has(key)) continue;
        const description = wardrobeDescriptionFor(scene.wardrobe, character.name);
        rows.push({
          project_id: id,
          character_id: character.id,
          scene_id: scene.id,
          outfit_name: description ? `${character.name} scene ${scene.scene_number} outfit` : "",
          description,
          notes: "",
          locked: false,
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("wardrobe_items").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordProjectActivity(supabase, {
      projectId: id,
      activityType: "wardrobe_auto_populated",
      title: `Created ${rows.length} wardrobe continuity item${rows.length === 1 ? "" : "s"}`,
      actorUserId: user && !user.isAnonymous ? user.id : null,
      actorEmail: user?.email ?? null,
      metadata: { inserted: rows.length },
    });

    return NextResponse.json({ success: true, inserted: rows.length });
  }

  const characterId = nullableUuid(body.character_id);
  const sceneId = nullableUuid(body.scene_id);
  if (!characterId || !sceneId) {
    return NextResponse.json({ error: "character_id and scene_id are required" }, { status: 400 });
  }

  const payload = {
    project_id: id,
    character_id: characterId,
    scene_id: sceneId,
    outfit_name: text(body.outfit_name),
    description: text(body.description),
    notes: text(body.notes),
    locked: Boolean(body.locked),
    reference_image_url: text(body.reference_image_url) || null,
  };

  const { data, error } = await supabase
    .from("wardrobe_items")
    .upsert(payload, { onConflict: "character_id,scene_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: data.locked ? "wardrobe_locked" : "wardrobe_updated",
    title: data.locked ? "Locked wardrobe continuity item" : "Updated wardrobe continuity item",
    body: data.description?.slice(0, 180) || null,
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: { wardrobe_item_id: data.id, character_id: characterId, scene_id: sceneId },
  });

  return NextResponse.json({ item: data });
}
