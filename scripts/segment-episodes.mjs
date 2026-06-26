#!/usr/bin/env node
/**
 * Episode segmentation — bind every scene to its TRUE script episode.
 *
 * The Porcelain & Blood script is a vertical microdrama: each "EPISODE N - TITLE"
 * is ~2 pages. The pipeline extracted 101 scenes into one project with NO episode
 * boundaries, so "EP1" had been guessed as Scenes 1-5 — wrong. EP1 "Meet Jing" is
 * really just the SF-tower + penthouse/locket beats (pipeline Scenes 1-2); the
 * bedroom/fold is EP2 "The Old Lady" (Scene 3); the Neptune is EP3.
 *
 * This parses projects.script_text for the EPISODE headers + the scene headings
 * under each, then aligns the pipeline scenes (in scene_number order = script
 * order) to those headings and writes scenes.episode_number / episode_title.
 *
 * Usage: node scripts/segment-episodes.mjs <project_id> [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PID = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!PID) { console.error("Usage: node scripts/segment-episodes.mjs <project_id> [--apply]"); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// normalize a scene heading to a comparable core: drop INT/EXT, time, era, punctuation
function core(h) {
  return (h || "")
    .toUpperCase()
    .replace(/^\s*(INT\.|EXT\.|INT\/EXT\.?|I\/E\.?)/i, "")
    .replace(/[–—-]\s*(MORNING|DAY|NIGHT|EVENING|DAWN|DUSK|LATE [A-Z]+|EARLY [A-Z]+|CONTINUOUS|MOMENTS LATER|AFTERNOON).*$/i, "")
    .replace(/\b(18\d\d|20\d\d)\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

const { data: proj } = await sb.from("projects").select("script_text").eq("id", PID).single();
const st = proj?.script_text || "";
if (!st) { console.error("no script_text on project"); process.exit(1); }

// 1) Parse the script into an ordered list of episodes. Formats vary:
//    "EPISODE 1 - MEET JING", "EPISODE 3", "EPISODE 4 -SPOILS",
//    "EPISODE 9: THE HUNT", "EPISODE 11 LEVERAGE", "EPISODE 20 – GOLDEN GHETTO".
//    The numbering RESTARTS after 31 (Season 2), so track season + assign an
//    absolute episode index so S1E1 (Meet Jing) never collides with S2E1.
// [^\S\n] = horizontal whitespace only, so a bare "EPISODE 3\n" doesn't slurp
// the next line as its title.
const epRe = /EPISODE[^\S\n]+(\d+)[^\S\n]*[-–—:]*[^\S\n]*([^\n]*)/gi;
const eps = [];
let m;
let season = 1, prevNum = 0, abs = 0;
while ((m = epRe.exec(st))) {
  const num = Number(m[1]);
  if (num < prevNum) season += 1; // numbering reset → new season
  prevNum = num;
  abs += 1;
  const title = (m[2] || "").trim().replace(/\s+/g, " ") || "(untitled)";
  eps.push({ abs, season, num, title, label: `S${season}E${num} — ${title}`, index: m.index });
}
eps.sort((a, b) => a.index - b.index);

const headRe = /^[ \t]*(INT\.|EXT\.|INT\/EXT\.?)[ \t].+$/gim;
const scriptHeads = [];
let h;
while ((h = headRe.exec(st))) {
  let ep = eps[0];
  for (const e of eps) { if (e.index <= h.index) ep = e; else break; }
  scriptHeads.push({ raw: h[0].trim(), core: core(h[0]), abs: ep?.abs ?? null, label: ep?.label ?? null, index: h.index });
}
console.log(`script: ${eps.length} episode headers (${season} seasons), ${scriptHeads.length} scene headings`);
console.log("first episodes:", eps.slice(0, 6).map((e) => e.label).join(" | "));

// 2) Pull pipeline scenes in order
const { data: scenes } = await sb.from("scenes").select("id, scene_number, location").eq("project_id", PID).order("scene_number");

// 3) Strict sequential alignment: pipeline scenes are in script order, so scene_i
//    ≈ heading_i. Advance a cursor one heading per scene; if the current heading
//    doesn't fuzzy-match the scene, look ahead a few to resync past extra script
//    headings that never became scenes (106 headings vs 101 scenes).
const matches = (a, b) => a && b && (a === b || a.startsWith(b.slice(0, 14)) || b.startsWith(a.slice(0, 14)));
let cursor = 0;
const assign = [];
let last = eps[0] || { abs: 1, label: "S1E1" };
for (const sc of scenes || []) {
  const c = core(sc.location);
  let hit = -1;
  for (let i = cursor; i < Math.min(scriptHeads.length, cursor + 5); i++) {
    if (matches(scriptHeads[i].core, c)) { hit = i; break; }
  }
  if (hit >= 0) {
    const sh = scriptHeads[hit];
    last = { abs: sh.abs, label: sh.label };
    cursor = hit + 1;
    assign.push({ id: sc.id, n: sc.scene_number, abs: sh.abs, label: sh.label, matched: sh.raw, conf: "match" });
  } else {
    // no match in window — assume 1:1 with the current heading, consume it
    const sh = scriptHeads[cursor] || null;
    if (sh) { last = { abs: sh.abs, label: sh.label }; cursor += 1; }
    assign.push({ id: sc.id, n: sc.scene_number, abs: last.abs, label: last.label, matched: sh ? `~${sh.raw}` : "(inherit)", conf: "approx" });
  }
}

console.log("\nscene → episode (first 14):");
for (const a of assign.slice(0, 14)) console.log(`  S${String(a.n).padStart(3)} -> EP#${a.abs} ${a.label || ""} [${a.conf}] ${a.matched.slice(0, 42)}`);
const tally = {};
for (const a of assign) { const k = `${a.abs} ${a.label}`; tally[k] = (tally[k] || 0) + 1; }
console.log("\nfirst 6 episodes (abs → scene count):");
for (const [k, v] of Object.entries(tally).slice(0, 6)) console.log(`  EP#${k}: ${v} scene(s)`);
for (const e of [1, 2, 3, 4]) console.log(`EP#${e} scenes:`, assign.filter((a) => a.abs === e).map((a) => "S" + a.n).join(", ") || "(none)");

writeFileSync(new URL("../episode_segmentation.json", import.meta.url), JSON.stringify(assign, null, 2));

if (APPLY) {
  for (const a of assign) {
    await sb.from("scenes").update({ episode_number: a.abs, episode_title: a.label }).eq("id", a.id);
  }
  console.log(`\n✅ Applied episode_number/title to ${assign.length} scenes.`);
} else {
  console.log("\n(dry run — re-run with --apply to write)");
}
