#!/usr/bin/env node
/**
 * Stitch the latest full assembly into a single MP4 and publish it.
 *
 * Usage:  node scripts/stitch-film.mjs <project_id> [--base https://...]
 *
 * Requires ffmpeg on PATH (`brew install ffmpeg`). Downloads every clip in
 * the assembly manifest (scene/panel order), concatenates them with
 * stream-copy (all clips are same-codec Seedance 720p H.264, so no
 * re-encode), uploads the result to the public Storage bucket, and stamps
 * assembled_videos.video_url so the Screening Room serves one file.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const projectId = process.argv[2];
const baseFlag = process.argv.indexOf("--base");
const BASE = baseFlag > -1 ? process.argv[baseFlag + 1] : "https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app";
if (!projectId) {
  console.error("Usage: node scripts/stitch-film.mjs <project_id> [--base url]");
  process.exit(1);
}

// ffmpeg present?
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg not found on PATH. Install it first: brew install ffmpeg");
  process.exit(1);
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

// 3. Concat (stream copy — same codec/resolution across Seedance clips)
const listFile = join(dir, "list.txt");
writeFileSync(listFile, files.map((f) => `file '${f}'`).join("\n"));
const outFile = join(dir, "film.mp4");
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outFile], { stdio: "inherit" });

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
