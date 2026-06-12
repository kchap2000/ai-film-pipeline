#!/usr/bin/env node
/**
 * Stitch the latest full assembly into a single MP4 and publish it.
 *
 * Usage:  node scripts/stitch-film.mjs <project_id> [--base https://...]
 *
 * ffmpeg resolution order: system PATH, then the bundled ffmpeg-static
 * devDependency (no Homebrew or system install needed). Downloads every
 * clip in the assembly manifest (scene/panel order), concatenates with
 * stream-copy, falls back to a re-encode concat when clips' codec params
 * differ, uploads the result to the public Storage bucket, and stamps
 * assembled_videos.video_url so the Screening Room serves one file.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const projectId = process.argv[2];
const baseFlag = process.argv.indexOf("--base");
const BASE = baseFlag > -1 ? process.argv[baseFlag + 1] : "https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app";
if (!projectId) {
  console.error("Usage: node scripts/stitch-film.mjs <project_id> [--base url]");
  process.exit(1);
}

// Resolve ffmpeg: PATH first, then the ffmpeg-static package binary
let FFMPEG = "ffmpeg";
try {
  execFileSync(FFMPEG, ["-version"], { stdio: "ignore" });
} catch {
  try {
    const require = createRequire(import.meta.url);
    const staticPath = require("ffmpeg-static");
    if (staticPath && existsSync(staticPath)) {
      FFMPEG = staticPath;
      execFileSync(FFMPEG, ["-version"], { stdio: "ignore" });
    } else {
      throw new Error("no static binary");
    }
  } catch {
    console.error("ffmpeg not found. Run: npm install -D ffmpeg-static  (or brew install ffmpeg)");
    process.exit(1);
  }
}

// Supabase creds from .env.local (anon key — bucket allows uploads)
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// 1. Latest full assembly manifest
const res = await fetch(`${BASE}/api/projects/${projectId}/assembly`);
const { latest_full } = await res.json();
if (!latest_full?.manifest?.length) {
  console.error("No full assembly with clips found — run assembly first.");
  process.exit(1);
}
console.log(`Assembly ${latest_full.id}: ${latest_full.manifest.length} clips, ~${Math.round(latest_full.duration_seconds || 0)}s`);

// 2. Download clips in manifest order
const dir = mkdtempSync(join(tmpdir(), "stitch-"));
const files = [];
for (const [i, entry] of latest_full.manifest.entries()) {
  const file = join(dir, `clip-${String(i).padStart(3, "0")}.mp4`);
  const clipRes = await fetch(entry.video_url);
  if (!clipRes.ok) {
    console.error(`Download failed for clip ${entry.clip_id}: ${clipRes.status}`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(clipRes.body), createWriteStream(file));
  files.push(file);
  console.log(`  [${i + 1}/${latest_full.manifest.length}] S${entry.scene_number} P${entry.panel_number}`);
}

// 3. Concat: stream copy first (fast, lossless — works when all clips
// share codec params); on failure, re-encode concat (handles mixed
// encoders/resolutions across fulfillment paths).
const listFile = join(dir, "list.txt");
writeFileSync(listFile, files.map((f) => `file '${f}'`).join("\n"));
const outFile = join(dir, "film.mp4");
try {
  execFileSync(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outFile], { stdio: "inherit" });
} catch {
  console.log("Stream-copy concat failed (mixed codec params) — re-encoding…");
  execFileSync(
    FFMPEG,
    [
      "-y", "-f", "concat", "-safe", "0", "-i", listFile,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      outFile,
    ],
    { stdio: "inherit" }
  );
}

// 3b. Storage caps uploads at 50MB (project-wide limit). If the concat
// exceeds it, re-encode with a bitrate budgeted to fit under the cap.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const { statSync } = await import("node:fs");
if (statSync(outFile).size > MAX_UPLOAD_BYTES) {
  const durationSec = Math.max(1, Math.round(latest_full.duration_seconds || 120));
  // Target 47MB total; subtract audio (128k) and leave mux overhead headroom
  const videoKbps = Math.floor(((47 * 8192) / durationSec) - 128 - 50);
  console.log(`Output exceeds 50MB cap — re-encoding at ${videoKbps}k video to fit…`);
  const fitFile = join(dir, "film-fit.mp4");
  execFileSync(
    FFMPEG,
    [
      "-y", "-i", outFile,
      "-c:v", "libx264", "-preset", "medium", "-b:v", `${videoKbps}k`,
      "-maxrate", `${videoKbps}k`, "-bufsize", `${videoKbps * 2}k`, "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      fitFile,
    ],
    { stdio: "inherit" }
  );
  execFileSync("mv", [fitFile, outFile]);
}

// 4. Upload + stamp the assembly row
const storagePath = `films/${projectId}/${latest_full.id}.mp4`;
const bytes = readFileSync(outFile);
const { error: upErr } = await supabase.storage
  .from("project-uploads")
  .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });
if (upErr) {
  console.error("Upload failed:", upErr.message);
  process.exit(1);
}
const { data: pub } = supabase.storage.from("project-uploads").getPublicUrl(storagePath);
const { error: dbErr } = await supabase
  .from("assembled_videos")
  .update({ video_url: pub.publicUrl })
  .eq("id", latest_full.id);
if (dbErr) {
  console.error("DB stamp failed:", dbErr.message);
  process.exit(1);
}
console.log(`\n✅ Stitched film: ${pub.publicUrl}`);
console.log(`Screening Room will now serve the single file.`);

// Temp dirs hold ~100MB of clips each — leaking them fills the disk
const { rmSync } = await import("node:fs");
rmSync(dir, { recursive: true, force: true });
