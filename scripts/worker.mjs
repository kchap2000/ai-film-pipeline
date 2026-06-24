#!/usr/bin/env node
/**
 * worker.mjs — Track B: no-Vercel-Pro local worker.
 *
 * The deployment hard-caps functions at ~60s (maxDuration=300 is NOT honored),
 * so the two heavy single-call steps 504: LLM extraction and the per-scene
 * storyboard shot-breakdown. This worker runs BOTH locally (no cap) against the
 * Anthropic SDK and writes the exact rows the routes write, then leaves the
 * project ready for the orchestrator to resume from cast_generate — every other
 * step is already per-item and under the cap.
 *
 * Usage:
 *   node scripts/worker.mjs <project_id> [--only extract|storyboard] [--runtime 90] [--base <url>] [--drive]
 *   --drive : after writing rows, drive the orchestrator from cast_generate to done.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const argv = process.argv.slice(2);
const projectId = argv[0];
if (!projectId || projectId.startsWith("--")) {
  console.error("usage: node scripts/worker.mjs <project_id> [--only extract|storyboard] [--runtime 90] [--base <url>] [--drive]");
  process.exit(1);
}
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const only = flag("--only", null);
const runtime = Number(flag("--runtime", "90"));
const BASE = flag("--base", env.PIPELINE_BASE_URL || "http://localhost:3000");
const drive = argv.includes("--drive");
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// ── EXTRACTION (mirrors src/lib/extract.ts + intake.mjs, no 60s cap) ─────
const EXTRACTION_PROMPT = `You are a film script analyst. Read the SCRIPT and optional BIBLE and return ONLY valid JSON (no markdown).
Detect scene format and group sensibly. Extract:
- characters: ONLY characters who actually appear in the script (speaking or physically present). [{name, description (ALL physical detail; if none: "No physical description provided"), role (lead|supporting|minor|extra|mentioned), personality, voice_only (bool)}]
- scenes: [{scene_number, location (clean name), time_of_day, scene_type (real|dream|fantasy|flashback|montage), action_summary (2-4 sentences), mood, props[], wardrobe[{character,description}], characters_present[]}]
- locations: [{name, description, time_of_day, mood}] — unique, deduped, clean names.
- structure: {acts[{act_number,title,description,scene_range:[s,e]}], episode_title, genre, logline, themes[]}
- setting_profile: {era, technology_level, wardrobe_rules[], forbidden[] (concrete anachronisms for the era)}
Use null/[] when absent. Never invent.`;

function cleanText(t) {
  return (t || "")
    .split("\n")
    .filter((line) => !/^[*\s]+$/.test(line) && !/^\d+\.?$/.test(line.trim()))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n");
}

async function loadProjectText() {
  const { data: files } = await supabase
    .from("project_files")
    .select("storage_path, file_name, file_type")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: true });
  if (!files || files.length === 0) {
    // Fall back to projects.script_text if files aren't in storage
    const { data: proj } = await supabase.from("projects").select("script_text").eq("id", projectId).single();
    if (proj?.script_text) return cleanText(proj.script_text);
    throw new Error("No project_files and no script_text — nothing to extract");
  }
  const parts = [];
  for (const f of files) {
    const { data: blob, error } = await supabase.storage.from("project-uploads").download(f.storage_path);
    if (error || !blob) { console.warn(`  ! could not download ${f.file_name}: ${error?.message}`); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const name = (f.file_name || "").toLowerCase();
    try {
      if (name.endsWith(".pdf") || f.file_type === "application/pdf") {
        const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
        parts.push((await pdfParse(buf)).text);
      } else if (name.endsWith(".docx")) {
        const mammoth = (await import("mammoth")).default;
        parts.push((await mammoth.extractRawText({ buffer: buf })).value);
      } else {
        parts.push(buf.toString("utf8"));
      }
    } catch (e) { console.warn(`  ! parse failed for ${f.file_name}: ${e.message}`); }
  }
  return cleanText(parts.join("\n\n---\n\n"));
}

async function extractStory() {
  console.log("🧠 Extracting locally (no 60s cap)…");
  const text = await loadProjectText();
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 8192, system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content: `Analyze and extract:\n\n${text.slice(0, 180000)}` }],
  });
  const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("extraction returned no JSON");
  const story = JSON.parse(m[0]);

  // seed (mirrors intake.mjs seedExtraction / /api/extract writes)
  for (const t of ["storyboard_panels", "scene_variations", "scenes", "location_variations", "locations", "character_poses", "cast_variations", "characters", "extractions"]) {
    try { await supabase.from(t).delete().eq("project_id", projectId); } catch {}
  }
  await supabase.from("characters").insert((story.characters || []).map((c) => ({
    project_id: projectId, name: c.name, description: c.description || "",
    role: ["lead", "supporting", "minor", "extra", "mentioned"].includes(c.role) ? c.role : "minor",
    personality: c.personality || "", voice_only: !!c.voice_only,
  })));
  await supabase.from("locations").insert((story.locations || []).map((l) => ({
    project_id: projectId, name: l.name, description: l.description || "", time_of_day: l.time_of_day || "", mood: l.mood || "",
  })));
  const { data: locRows } = await supabase.from("locations").select("id,name").eq("project_id", projectId);
  const locId = Object.fromEntries((locRows || []).map((l) => [norm(l.name), l.id]));
  await supabase.from("scenes").insert((story.scenes || []).map((s) => ({
    project_id: projectId, scene_number: s.scene_number, location: s.location,
    location_id: locId[norm(s.location)] || null, time_of_day: s.time_of_day || "",
    scene_type: ["real", "dream", "fantasy", "flashback", "montage"].includes(s.scene_type) ? s.scene_type : "real",
    action_summary: s.action_summary || "", mood: s.mood || "", props: s.props || [], wardrobe: s.wardrobe || [],
    characters_present: s.characters_present || [], locked: false,
  })));
  await supabase.from("extractions").insert({ project_id: projectId, structure: story.structure || {}, raw_response: "worker.mjs (local extraction)" });
  const sp = story.setting_profile || {};
  const targetShots = Math.max(8, Math.round(runtime / 4));
  const notes = [
    `TARGET RUNTIME: ${runtime}s — the ENTIRE episode must total roughly ${targetShots} shots (about ${Math.max(1, Math.round(targetShots / Math.max(1, (story.scenes || []).length)))} per scene). Do NOT exceed ${Math.round(targetShots * 1.3)} shots total.`,
    sp.era ? `ERA: ${sp.era}.` : "",
    sp.forbidden?.length ? `NEVER depict: ${sp.forbidden.slice(0, 12).join("; ")}.` : "",
    `Characters and locations that have a locked reference image must match it exactly.`,
  ].filter(Boolean).join(" ");
  await supabase.from("projects").update({ setting_profile: story.setting_profile || null, production_notes: notes, phase_status: "extraction" }).eq("id", projectId);
  console.log(`   → ${story.characters?.length || 0} characters, ${story.scenes?.length || 0} scenes, ${story.locations?.length || 0} locations, era: ${sp.era || "—"}`);
  return story;
}

// ── STORYBOARD (per-scene breakdown, Phase 1 only, no cap) ───────────────
const STORYBOARD_SYSTEM = `You are a film storyboard artist breaking a scene into individual shots for a premium vertical-drama episode.
For each shot provide: shot_type (wide/medium/close-up/extreme-close-up/OTS/POV/two-shot/insert), camera_angle (eye-level/low/high/dutch/bird's-eye/worm's-eye), camera_movement (static/pan-left/pan-right/tilt-up/tilt-down/dolly-in/dolly-out/crane-up/crane-down/handheld/steadicam), action_description (ONE clear action beat), dialogue (verbatim from script, empty string if none), characters_in_shot (array of names), duration_seconds (2.0-6.0; up to 9.0 for a major beat).
- BINDING SHOT BUDGET: a HARD SHOT CAP in the user message OVERRIDES all ranges — never exceed it.
- EVERY scripted dialogue line gets its own shot (or a reaction carrying it as O.S. audio). Use dialogue VERBATIM with NAME (tone): "line".
- Cover the ENTIRE scene, first beat to last. Return ONLY valid JSON: { "shots": [...] }.`;

async function storyboardLocally() {
  console.log("🎬 Storyboard breakdown locally (no 60s cap)…");
  const [{ data: scenes }, { data: proj }] = await Promise.all([
    supabase.from("scenes").select("*").eq("project_id", projectId).order("scene_number"),
    supabase.from("projects").select("production_notes, aspect_ratio, script_text").eq("id", projectId).single(),
  ]);
  if (!scenes || scenes.length === 0) throw new Error("No scenes — run extraction first");
  const productionNotes = proj?.production_notes || "";
  const aspectRatio = proj?.aspect_ratio || "9:16";
  const scriptText = (proj?.script_text || "").slice(0, 30000);
  const m = productionNotes.match(/(?:total|roughly|about)\D{0,12}(\d{1,3})\s*shots/i);
  const totalTarget = m ? Number(m[1]) : 0;
  const perScene = totalTarget ? Math.max(2, Math.ceil(totalTarget / Math.max(1, scenes.length))) : 8;

  let panels = 0, scenesDone = 0;
  for (const scene of scenes) {
    const { count } = await supabase.from("storyboard_panels").select("*", { count: "exact", head: true }).eq("scene_id", scene.id);
    if ((count || 0) > 0) continue;
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 16000, system: STORYBOARD_SYSTEM,
      messages: [{ role: "user", content:
        `HARD SHOT CAP for this scene: at most ${perScene} shots — do not exceed it.\n\nBreak this scene into storyboard shots:\n\n` +
        `Scene ${scene.scene_number}: ${scene.location || "Unknown"}\nTime: ${scene.time_of_day || "Day"}\nMood: ${scene.mood || "Neutral"}\n` +
        `Action: ${scene.action_summary || "No action described"}\nCharacters present: ${(scene.characters_present || []).join(", ") || "None"}\n` +
        `Props: ${(scene.props || []).join(", ") || "None"}` +
        (scriptText ? `\n\n--- FULL SCRIPT (quote dialogue verbatim; use only this scene's parts) ---\n\n${scriptText}` : ""),
      }],
    });
    let shots = [];
    try {
      const jm = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").match(/\{[\s\S]*\}/);
      if (jm) shots = JSON.parse(jm[0]).shots || [];
    } catch {}
    if (shots.length === 0) {
      shots = [{ shot_type: "wide", camera_angle: "eye-level", camera_movement: "static", action_description: scene.action_summary || "Scene action", dialogue: "", characters_in_shot: scene.characters_present || [], duration_seconds: 5.0 }];
    }
    const rows = shots.map((s, i) => ({
      project_id: projectId, scene_id: scene.id, panel_number: i + 1,
      shot_type: s.shot_type, camera_angle: s.camera_angle, camera_movement: s.camera_movement,
      action_description: s.action_description, dialogue: s.dialogue || "", characters_in_shot: s.characters_in_shot || [],
      image_url: "", prompt_used: "", aspect_ratio: aspectRatio, duration_seconds: s.duration_seconds || 3.0,
    }));
    const { error } = await supabase.from("storyboard_panels").insert(rows);
    if (error) { console.warn(`  ! scene ${scene.scene_number} insert failed: ${error.message}`); continue; }
    panels += rows.length; scenesDone++;
    console.log(`   scene ${scene.scene_number}: ${rows.length} panels`);
  }
  await supabase.from("projects").update({ phase_status: "storyboard" }).eq("id", projectId);
  console.log(`   → ${panels} panels across ${scenesDone} scenes`);
}

async function driveOrchestrator() {
  console.log("▶ Driving orchestrator from cast_generate…");
  await fetch(`${BASE}/api/projects/${projectId}/auto-pipeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", start_from_step: "cast_generate" }) });
  for (let i = 0; i < 400; i++) {
    const r = await fetch(`${BASE}/api/projects/${projectId}/auto-pipeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "step" }) });
    const j = await r.json().catch(() => ({}));
    if (j.work) console.log(`   ${j.work}`);
    const st = j.run?.status;
    if (st === "completed" || st === "failed") { console.log(`   run ${st}`); break; }
  }
}

(async () => {
  if (!only || only === "extract") await extractStory();
  if (!only || only === "storyboard") await storyboardLocally();
  if (drive) await driveOrchestrator();
  console.log(`\n✅ worker done for ${projectId}. Resume: POST /auto-pipeline {action:"start", start_from_step:"cast_generate"}\n`);
})().catch((e) => { console.error("\nWORKER FAILED:", e.message); process.exit(1); });
