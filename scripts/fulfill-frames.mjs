#!/usr/bin/env node
/**
 * fulfill-frames.mjs — Track A connector runner for ELEMENT keyframes.
 *
 * The keyframe twin of fulfill-clips.mjs. The pipeline plans deferred element
 * keyframes (POST /first-frames {action:"plan_elements"}) which insert
 * first_frames rows with model_used="higgsfield_nano_banana_2", a placeholder
 * SVG image, and prompt_used = the connector-ready <<<element_id>>> prompt
 * built by the prompt engine (identity + wardrobe + props + set all locked).
 *
 * This runner reads those pending rows and fulfills them two ways:
 *   - REST mode  (HIGGSFIELD_API_KEY/SECRET in .env.local): generate directly.
 *   - Agent mode (default — no creds): emit a work-manifest JSON that a Cowork
 *     session with the Higgsfield MCP fulfills (generate_image with the SAME
 *     prompt, then PATCH the image back). One engine, no hand-rolled prompts.
 *
 * Usage:
 *   node scripts/fulfill-frames.mjs <project_id> [--mode rest|agent] [--base <url>]
 *   node scripts/fulfill-frames.mjs <project_id> --apply <results.json>   # PATCH images back
 *
 * results.json (agent writes after generating): [{ "frame_id": "...", "image_url": "https://..." }]
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const argv = process.argv.slice(2);
const projectId = argv[0];
if (!projectId || projectId.startsWith("--")) {
  console.error("usage: node scripts/fulfill-frames.mjs <project_id> [--mode rest|agent] [--base <url>] [--apply <results.json>]");
  process.exit(1);
}
const flag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const BASE = flag("--base", env.PIPELINE_BASE_URL || "http://localhost:3000");
const applyFile = flag("--apply", null);
const hasRest = !!(env.HIGGSFIELD_API_KEY && env.HIGGSFIELD_API_SECRET);
const mode = flag("--mode", hasRest ? "rest" : "agent");

const HIGGSFIELD_FRAME_MODEL = "higgsfield_nano_banana_2";

async function patchFrame(frameId, imageUrl) {
  // Prefer the route (records provenance, flips prior approved → replaced),
  // fall back to a direct DB write if the route is unreachable.
  try {
    const res = await fetch(`${BASE}/api/projects/${projectId}/first-frames`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_id: frameId, status: "approved", image_url: imageUrl, model_used: HIGGSFIELD_FRAME_MODEL }),
    });
    if (res.ok) return true;
  } catch { /* fall through to direct DB */ }
  const { data: f } = await supabase.from("first_frames").select("panel_id").eq("id", frameId).single();
  await supabase.from("first_frames").update({ image_url: imageUrl, status: "approved" }).eq("id", frameId);
  if (f?.panel_id) {
    await supabase.from("first_frames").update({ status: "replaced" }).eq("panel_id", f.panel_id).eq("status", "approved").neq("id", frameId);
    await supabase.from("first_frames").update({ status: "approved" }).eq("id", frameId);
    await supabase.from("storyboard_panels").update({ approved_first_frame_id: frameId }).eq("id", f.panel_id);
  }
  return true;
}

// ── --apply mode: write generated images back ───────────────────────────
if (applyFile) {
  const results = JSON.parse(fs.readFileSync(applyFile, "utf8"));
  let n = 0;
  for (const r of results) {
    if (!r.frame_id || !r.image_url) continue;
    await patchFrame(r.frame_id, r.image_url);
    n++;
    console.log(`  ✓ frame ${r.frame_id} ← ${r.image_url.slice(0, 64)}…`);
  }
  console.log(`applied ${n} element keyframes`);
  process.exit(0);
}

// ── Load pending deferred element frames ────────────────────────────────
const { data: frames } = await supabase
  .from("first_frames")
  .select("id, panel_id, prompt_used, aspect_ratio, image_url, model_used, status")
  .eq("project_id", projectId)
  .eq("model_used", HIGGSFIELD_FRAME_MODEL)
  .eq("status", "pending");
const pending = (frames || []).filter((f) => (f.image_url || "").startsWith("data:image/svg"));

if (pending.length === 0) {
  console.log("No pending element keyframes. Run POST /first-frames {action:'plan_elements'} first.");
  process.exit(0);
}

// Label with scene/panel for readability
const panelIds = pending.map((f) => f.panel_id);
const { data: panels } = await supabase.from("storyboard_panels").select("id, panel_number, scene_id").in("id", panelIds);
const { data: scenes } = await supabase.from("scenes").select("id, scene_number").in("id", Array.from(new Set((panels || []).map((p) => p.scene_id))));
const sceneNum = Object.fromEntries((scenes || []).map((s) => [s.id, s.scene_number]));
const panelInfo = Object.fromEntries((panels || []).map((p) => [p.id, { panel: p.panel_number, scene: sceneNum[p.scene_id] }]));

const work = pending.map((f) => ({
  frame_id: f.id,
  panel_id: f.panel_id,
  scene: panelInfo[f.panel_id]?.scene ?? null,
  panel: panelInfo[f.panel_id]?.panel ?? null,
  aspect_ratio: f.aspect_ratio || "9:16",
  element_ids: Array.from(new Set([...(f.prompt_used || "").matchAll(/<<<([0-9a-f-]{36})>>>/g)].map((m) => m[1]))),
  prompt: f.prompt_used,
}));

if (mode === "rest") {
  console.error("REST mode: Higgsfield image-generation REST endpoint is not yet wired (no confirmed contract). " +
    "Set creds + implement submitImage(), or run in agent mode. Emitting manifest instead.");
}

const manifestPath = `/tmp/${projectId}_frames_manifest.json`;
fs.writeFileSync(manifestPath, JSON.stringify({ project_id: projectId, base: BASE, model: "nano_banana_2", frames: work }, null, 2));
console.log(`\n${work.length} element keyframe(s) ready for connector fulfillment.`);
console.log(`Manifest: ${manifestPath}\n`);
for (const w of work) {
  console.log(`  scene ${w.scene} panel ${w.panel}  frame=${w.frame_id}  elements=[${w.element_ids.join(", ")}]`);
}
console.log(`\nAgent fulfillment (Cowork w/ Higgsfield MCP):`);
console.log(`  for each frame → generate_image({model:"nano_banana_2", aspect_ratio, prompt})  (prompt already carries <<<element_id>>> tags)`);
console.log(`  collect {frame_id, image_url} → node scripts/fulfill-frames.mjs ${projectId} --apply results.json`);
