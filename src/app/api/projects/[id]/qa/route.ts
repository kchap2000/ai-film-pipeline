import { createRouteClient } from "@/lib/supabase-route";
import { recordLesson } from "@/lib/lessons";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Phase 12 — QA Beat Analysis (FINAL_VISION.md).
 *
 * Claude reviews the assembled video against the screenplay. V1 evidence
 * set: the approved first frame per shot (the canonical visual of each
 * clip's starting state) + per-shot motion metadata + the extracted
 * screenplay structure. Frame-accurate sampling of the rendered clips can
 * slot in later without changing the report schema.
 */

const QA_MODEL = "claude-sonnet-4-6";
const MAX_FRAMES = 20; // keep payload sane; sample evenly when over

function toImageBlock(imageUrl: string): Anthropic.ImageBlockParam | null {
  const dataMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    if (dataMatch[1].includes("svg")) return null;
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: dataMatch[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: dataMatch[2],
      },
    };
  }
  if (imageUrl.startsWith("http")) {
    return { type: "image", source: { type: "url", url: imageUrl } };
  }
  return null;
}

// GET /api/projects/:id/qa — latest report
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("qa_reports")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ latest: data || null });
}

// POST /api/projects/:id/qa — run beat analysis, store + return report
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [scenesRes, panelsRes, extractionRes, assemblyRes, clipsRes] = await Promise.all([
    supabase
      .from("scenes")
      .select("id, scene_number, location, time_of_day, mood, action_summary, characters_present")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
    supabase
      .from("storyboard_panels")
      .select("id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, characters_in_shot, approved_first_frame_id")
      .eq("project_id", id)
      .order("panel_number", { ascending: true }),
    supabase
      .from("extractions")
      .select("structure")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("assembled_videos")
      .select("id")
      .eq("project_id", id)
      .eq("scope", "full")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("video_clips")
      .select("panel_id, status, model_used, motion_description")
      .eq("project_id", id)
      .in("status", ["approved", "completed"]),
  ]);

  const scenes = scenesRes.data || [];
  const panels = panelsRes.data || [];
  if (scenes.length === 0 || panels.length === 0) {
    return NextResponse.json({ error: "Need scenes + storyboard panels before QA" }, { status: 400 });
  }

  const clipByPanel: Record<string, { model_used: string; motion_description: string | null }> = {};
  for (const c of clipsRes.data || []) clipByPanel[c.panel_id] = c;

  // Collect approved first frames (sampled evenly to MAX_FRAMES)
  const framedPanels = panels.filter((p) => p.approved_first_frame_id);
  const step = Math.max(1, Math.ceil(framedPanels.length / MAX_FRAMES));
  const sampled = framedPanels.filter((_, i) => i % step === 0).slice(0, MAX_FRAMES);

  const sceneNumberById: Record<string, number> = {};
  for (const s of scenes) sceneNumberById[s.id] = s.scene_number;

  const content: Anthropic.ContentBlockParam[] = [];
  for (const panel of sampled) {
    const { data: frame } = await supabase
      .from("first_frames")
      .select("image_url")
      .eq("id", panel.approved_first_frame_id as string)
      .single();
    if (!frame?.image_url) continue;
    const block = toImageBlock(frame.image_url);
    if (!block) continue;
    const clip = clipByPanel[panel.id];
    content.push({
      type: "text",
      text: `Shot evidence — Scene ${sceneNumberById[panel.scene_id] ?? "?"}, Panel ${panel.panel_number} (panel_id: ${panel.id}). Shot type: ${panel.shot_type}. Camera: ${panel.camera_angle}, movement: ${panel.camera_movement}. Scripted action: ${panel.action_description}. Characters: ${(panel.characters_in_shot || []).join(", ") || "none"}.${clip ? ` Rendered as video via ${clip.model_used}: ${clip.motion_description || ""}.` : " No video clip rendered yet."}`,
    });
    content.push(block);
  }

  if (content.length === 0) {
    return NextResponse.json({ error: "No approved first frames to analyze" }, { status: 400 });
  }

  const structure = extractionRes.data?.structure || {};
  const screenplaySummary = scenes
    .map((s) => `Scene ${s.scene_number} — ${s.location} (${s.time_of_day}, mood: ${s.mood}): ${s.action_summary}. Characters: ${(s.characters_present || []).join(", ")}.`)
    .join("\n");

  content.push({
    type: "text",
    text: `SCREENPLAY STRUCTURE:\n${JSON.stringify(structure).slice(0, 3000)}\n\nSCENE BEATS:\n${screenplaySummary}\n\nAnalyze the shot evidence above against the screenplay. For each scene: do the visuals hit the scripted beats? Are characters consistent across shots? Does the mood match? Does the camera work match what was specified?\n\nReturn ONLY valid JSON:\n{\n  "overall_score": <0-100>,\n  "beat_accuracy": [{"scene_number": n, "score": <0-100>, "notes": "..."}],\n  "character_flags": [{"character": "...", "issue": "...", "shots": ["Scene N Panel M"]}],\n  "mood_flags": [{"scene_number": n, "expected": "...", "observed": "..."}],\n  "regen_targets": [{"panel_id": "<uuid from the evidence labels>", "scene_number": n, "panel_number": m, "reason": "..."}]\n}`,
  });

  const anthropic = new Anthropic();
  let report;
  try {
    const response = await anthropic.messages.create({
      model: QA_MODEL,
      max_tokens: 4000,
      system:
        "You are a film QA supervisor checking an AI-generated film against its screenplay. Be specific and honest — flag drift, identity inconsistencies, and mood mismatches. Score conservatively: 100 means every beat landed perfectly.",
      messages: [{ role: "user", content }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("QA model returned no JSON");
    report = JSON.parse(match[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `QA analysis failed: ${msg}` }, { status: 500 });
  }

  const { data: saved, error: saveErr } = await supabase
    .from("qa_reports")
    .insert({
      project_id: id,
      assembled_video_id: assemblyRes.data?.id || null,
      overall_score: typeof report.overall_score === "number" ? report.overall_score : null,
      beat_accuracy: report.beat_accuracy || [],
      character_flags: report.character_flags || [],
      mood_flags: report.mood_flags || [],
      regen_targets: report.regen_targets || [],
    })
    .select("*")
    .single();

  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  // ── Learning system: QA findings become durable lessons ─────
  // Each flag turns into an avoid-rule injected into all future prompts.
  // Period/anachronism findings go GLOBAL (they apply to every film);
  // character/mood specifics stay project-scoped.
  try {
    for (const flag of (report.character_flags || []) as Array<{ character?: string; issue?: string }>) {
      if (!flag.issue) continue;
      const isPeriod = /anachron|modern|tactical|contemporary|out of period|wrong era/i.test(flag.issue);
      await recordLesson(supabase, {
        scope: isPeriod ? "global" : "project",
        projectId: id,
        category: isPeriod ? "period" : "continuity",
        lesson: isPeriod
          ? `Wardrobe/props must match the declared era — reviewers previously caught: ${flag.issue}`
          : `${flag.character ? `${flag.character}: ` : ""}avoid — ${flag.issue}`,
        evidence: `QA report ${saved.id}`,
      });
    }
    for (const flag of (report.mood_flags || []) as Array<{ scene_number?: number; expected?: string; observed?: string }>) {
      if (!flag.expected || !flag.observed) continue;
      await recordLesson(supabase, {
        scope: "project",
        projectId: id,
        category: "continuity",
        lesson: `Scene ${flag.scene_number ?? "?"}: deliver "${flag.expected}" — prior attempt drifted to "${flag.observed}"`,
        evidence: `QA report ${saved.id}`,
      });
    }
  } catch (err) {
    console.error("qa: lesson recording failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ success: true, report: saved });
}
