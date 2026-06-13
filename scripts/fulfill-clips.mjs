#!/usr/bin/env node
/**
 * Fulfill pending video clips via the Higgsfield CLI — closes the auto-mode
 * loop without REST API keys or a Cowork session.
 *
 * Usage:  node scripts/fulfill-clips.mjs <project_id> [--base url] [--finish] [--revision <id>]
 *
 * --revision <id>: only fulfill clips for the panels in that revision's
 * plan (REVISION_VISION R3); with --finish the assembly is stamped with
 * the revision id + changelog so the new film version carries lineage.
 *
 * Requires `higgsfield auth login` once per session (device login). For each
 * video_clips row in status 'pending' with no video_url:
 *   1. download the panel's approved first frame (start image)
 *   2. higgsfield generate create seedance_2_0 --prompt <prompt_used> --wait
 *      (element <<<id>>> placeholders resolve server-side — verified)
 *   3. PATCH the finished video_url back through the production API
 * Content blocks (ip_detected / nsfw) retry once element-anchored without
 * the start image — the ladder proven on the Apex Hunter run.
 * With --finish: POST assembly (force) and stitch the single MP4.
 */
import { execFileSync, execFile } from "node:child_process";
import { mkdtempSync, readFileSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const projectId = process.argv[2];
const baseFlag = process.argv.indexOf("--base");
const BASE = baseFlag > -1 ? process.argv[baseFlag + 1] : "https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app";
const FINISH = process.argv.includes("--finish");
const revisionFlag = process.argv.indexOf("--revision");
const REVISION_ID = revisionFlag > -1 ? process.argv[revisionFlag + 1] : null;
const CONCURRENCY = 4; // Higgsfield plan cap on concurrent jobs

if (!projectId) {
  console.error("Usage: node scripts/fulfill-clips.mjs <project_id> [--base url] [--finish]");
  process.exit(1);
}

// CLI present + authenticated?
try {
  execFileSync("higgsfield", ["auth", "token"], { stdio: "ignore" });
} catch {
  console.error("Higgsfield CLI not authenticated. Run: higgsfield auth login");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Pending clips that still need a video
const { data: allPending, error } = await supabase
  .from("video_clips")
  .select("id, panel_id, first_frame_id, duration_seconds, prompt_used, covered_panel_ids")
  .eq("project_id", projectId)
  .eq("status", "pending")
  .is("video_url", null)
  .order("created_at");
if (error) throw error;

// --revision: only the panels named in the revision's plan
let clips = allPending || [];
let revisionChangelog = null;
if (REVISION_ID) {
  const { data: revision, error: revErr } = await supabase
    .from("revisions")
    .select("plan")
    .eq("id", REVISION_ID)
    .single();
  if (revErr || !revision?.plan) {
    console.error(`Revision ${REVISION_ID} not found or has no plan.`);
    process.exit(1);
  }
  const targetPanelIds = new Set(
    (revision.plan.targets || []).flatMap((t) => t.panel_ids || [])
  );
  clips = clips.filter(
    (c) =>
      targetPanelIds.has(c.panel_id) ||
      (c.covered_panel_ids || []).some((pid) => targetPanelIds.has(pid))
  );
  revisionChangelog = (revision.plan.targets || []).map((t) => ({
    action: t.action,
    reason: t.correction || "",
    panel_id: (t.panel_ids || [])[0],
  }));
  console.log(`Revision ${REVISION_ID}: ${clips.length}/${allPending?.length || 0} pending clip(s) belong to this revision.`);
}

if (!clips?.length) {
  console.log("No pending clips to fulfill.");
} else {
  console.log(`${clips.length} pending clip(s) to fulfill.`);
}

const { data: project } = await supabase
  .from("projects")
  .select("aspect_ratio")
  .eq("id", projectId)
  .single();
const aspect = project?.aspect_ratio || "16:9";

const dir = mkdtempSync(join(tmpdir(), "fulfill-"));

async function frameFile(clip) {
  // First frames are uploaded to the public bucket at clip-creation time
  for (const ext of ["jpg", "png"]) {
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-uploads/video-frames/${projectId}/${clip.first_frame_id}.${ext}`;
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      const file = join(dir, `${clip.first_frame_id}.${ext}`);
      const res = await fetch(url);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
      return file;
    }
  }
  return null;
}

function clampDuration(d) {
  // 13s+ failed on the Apex run; 12 is the proven ceiling with audio
  return Math.min(12, Math.max(4, Math.round(Number(d) || 5)));
}

async function generate(clip, { useStartImage }) {
  const args = [
    "generate", "create", "seedance_2_0",
    "--prompt", clip.prompt_used,
    "--aspect_ratio", aspect,
    "--duration", String(clampDuration(clip.duration_seconds)),
    "--json", "--wait", "--wait-timeout", "15m", "--wait-interval", "10s",
  ];
  if (useStartImage) {
    const file = await frameFile(clip);
    if (file) args.push("--start-image", file);
  }
  const { stdout } = await execFileAsync("higgsfield", args, { maxBuffer: 16 * 1024 * 1024 });
  const text = stdout.toString();
  // Find the finished video URL anywhere in the job JSON
  const urlMatch = text.match(/https:\/\/[^"\s]+\.mp4/);
  const blocked = /ip_detected|nsfw/i.test(text) && !urlMatch;
  return { videoUrl: urlMatch ? urlMatch[0] : null, blocked, raw: text.slice(-400) };
}

async function fulfill(clip, index) {
  const tag = `[clip ${index + 1}/${clips.length}]`;
  try {
    let result = await generate(clip, { useStartImage: true });
    if (!result.videoUrl && result.blocked) {
      console.log(`${tag} content-blocked with start image — retrying element-only`);
      result = await generate(clip, { useStartImage: false });
    }
    if (!result.videoUrl) {
      console.error(`${tag} FAILED: ${result.raw.slice(0, 200)}`);
      await fetch(`${BASE}/api/projects/${projectId}/video-clips`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_id: clip.id, status: "failed" }),
      });
      return false;
    }
    const patch = await fetch(`${BASE}/api/projects/${projectId}/video-clips`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clip_id: clip.id, status: "completed", video_url: result.videoUrl }),
    });
    console.log(`${tag} ✅ ${result.videoUrl.slice(-60)} (patched: ${patch.ok})`);
    return true;
  } catch (err) {
    console.error(`${tag} error: ${err.message?.slice(0, 200)}`);
    return false;
  }
}

// Run in waves of CONCURRENCY
let done = 0;
for (let i = 0; i < (clips?.length || 0); i += CONCURRENCY) {
  const wave = clips.slice(i, i + CONCURRENCY);
  const results = await Promise.all(wave.map((c, j) => fulfill(c, i + j)));
  done += results.filter(Boolean).length;
}
if (clips?.length) console.log(`\nFulfilled ${done}/${clips.length} clips.`);

if (FINISH) {
  console.log("\nAssembling…");
  const asm = await fetch(`${BASE}/api/projects/${projectId}/assembly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      force: true,
      ...(REVISION_ID ? { revision_id: REVISION_ID, changelog: revisionChangelog } : {}),
    }),
  });
  const asmData = await asm.json().catch(() => ({}));
  console.log("Assembly:", JSON.stringify(asmData).slice(0, 200));
  if (asm.ok) {
    console.log("Stitching…");
    execFileSync("node", ["scripts/stitch-film.mjs", projectId, "--base", BASE], { stdio: "inherit" });
  }
}
