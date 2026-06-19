#!/usr/bin/env node
/**
 * intake.mjs — Asset Intake & Project Bootstrap (ASSET_INTAKE_PLAN.md)
 *
 * Point it at a folder of everything you already have — a script, a bible,
 * character headshots, pose sheets, location photos, prop refs, element IDs —
 * and it: classifies each file, extracts the story (locally, so it never hits
 * the deployment's 60s cap), maps assets to characters/locations/scenes, LOCKS
 * everything you provided, prints a READINESS report of what's missing, and
 * (optionally) fills only the gaps and runs to a finished episode.
 *
 * USAGE:
 *   node scripts/intake.mjs <assets-folder> [options]
 *     --project "Title"      project title (default: folder name)
 *     --aspect 9:16          aspect ratio (default 9:16)
 *     --runtime 90           target runtime seconds → caps shot density
 *     --element-map file     JSON { "Character Name": "higgsfield-id", ... }
 *     --base <url>           API base for the run stage (default prod)
 *     --project-id <id>      attach to an existing project instead of creating
 *     --report-only          stop after the readiness report (no run) [default]
 *     --fill-gaps            generate the missing pieces
 *     --run                  drive the pipeline to a finished episode
 *     --dry                  scan + classify + extract preview, write nothing
 *
 * Convention folders are matched exactly; anything else is vision-classified.
 *   Characters/<Name>/(headshot|pose|...).png|jpg
 *   Locations/<Name>/...      Props/<Name>/...
 *   *.md|*.txt                script / bible / notes (auto-detected)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── args + env ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const folder = argv[0];
const opt = (name, def = null) => { const i = argv.indexOf(`--${name}`); return i > -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : def; };
const has = (name) => argv.includes(`--${name}`);
if (!folder || !fs.existsSync(folder)) { console.error("Usage: node scripts/intake.mjs <assets-folder> [--project ... --runtime 90 --run]"); process.exit(1); }

const ROOT = path.resolve(__dirnameSafe(), "..");
function __dirnameSafe() { try { return path.dirname(new URL(import.meta.url).pathname); } catch { return process.cwd() + "/scripts"; } }
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const BASE = opt("base") || "https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app";
const TITLE = opt("project") || path.basename(folder.replace(/\/$/, ""));
const ASPECT = opt("aspect") || "9:16";
const RUNTIME = Number(opt("runtime") || 90);
const DRY = has("dry");
const DO_RUN = has("run");
const FILL = has("fill-gaps") || DO_RUN;

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const TXT_EXT = new Set([".md", ".txt"]);
const log = (...a) => console.log(...a);
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "of", "and", "at", "in", "on", "interior", "exterior", "ext", "int"]);
const toks = (s) => norm(s).split(" ").filter(w => w.length > 1 && !STOP.has(w));
// Word-order-independent name match: exact, or the smaller token set is mostly
// contained in the larger (handles "Khalil" vs "Khalil Chapman" and
// "Puerto Viejo Beach Road" vs "Beach Road — Puerto Viejo").
function nameMatch(a, b) {
  if (norm(a) === norm(b)) return true;
  const A = toks(a), B = toks(b); if (!A.length || !B.length) return false;
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  const bigSet = new Set(big);
  const overlap = small.filter(t => bigSet.has(t)).length;
  return overlap / small.length >= 0.6;
}
function findEntity(list, name) { return list.find(e => nameMatch(e.name, name)) || null; }

// ── 1. SCAN ─────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "Archive") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}
log(`\n📥 INTAKE — "${TITLE}"  (${folder})\n`);
const files = walk(folder);
const texts = files.filter(f => TXT_EXT.has(path.extname(f).toLowerCase()));
const images = files.filter(f => IMG_EXT.has(path.extname(f).toLowerCase()));
const pdfs = files.filter(f => [".pdf", ".docx"].includes(path.extname(f).toLowerCase()));
log(`Scanned ${files.length} files — ${texts.length} text, ${images.length} images${pdfs.length ? `, ${pdfs.length} pdf/docx (convert to .md/.txt — skipped)` : ""}.`);

// Convention parse for an image path → {entityKind, entityName, assetKind}
function conventionOf(file) {
  const parts = file.split(path.sep);
  const lower = parts.map(p => p.toLowerCase());
  const base = path.basename(file).toLowerCase();
  const assetKind = /pose ?sheet|poses|turnaround/.test(base) ? "pose_sheet"
    : /headshot|portrait|face|cover/.test(base) ? "headshot"
    : null;
  const ci = lower.lastIndexOf("characters");
  if (ci > -1 && parts[ci + 1]) return { entityKind: "character", entityName: parts[ci + 1], assetKind: assetKind || "headshot" };
  const li = lower.lastIndexOf("locations");
  if (li > -1 && parts[li + 1]) return { entityKind: "location", entityName: parts[li + 1].replace(/\.[^.]+$/, ""), assetKind: "reference" };
  const pi = lower.lastIndexOf("props");
  if (pi > -1 && parts[pi + 1]) return { entityKind: "prop", entityName: parts[pi + 1].replace(/\.[^.]+$/, ""), assetKind: "reference" };
  return null;
}

// ── helpers: downscale + base64 ─────────────────────────────────────
function toDataUrl(file, maxPx = 1400) {
  let buf = fs.readFileSync(file);
  let mime = path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  if (buf.length > 2.5 * 1024 * 1024) {
    try {
      const tmp = `/tmp/intake_${randomUUID()}.jpg`;
      execSync(`sips -s format jpeg -s formatOptions 80 -Z ${maxPx} ${JSON.stringify(file)} --out ${JSON.stringify(tmp)}`, { stdio: "ignore" });
      buf = fs.readFileSync(tmp); mime = "image/jpeg"; fs.unlinkSync(tmp);
    } catch {}
  }
  return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, mime, b64: buf.toString("base64") };
}

// ── 2+3. EXTRACT (local Anthropic — no 60s cap) ─────────────────────
const EXTRACTION_PROMPT = `You are a film script analyst. Read the EPISODE SCRIPT (first document) and the optional SERIES BIBLE (later documents) and return ONLY valid JSON (no markdown).
Detect scene format and group sensibly (4–8 scenes for a short). Extract:
- characters: ONLY characters who actually appear in THIS EPISODE'S SCRIPT (speaking or physically present in its scenes). Use the bible/spec ONLY to enrich the description/wardrobe/personality of those characters — do NOT add characters who are merely described in the bible for other episodes. [{name, description (ALL physical detail; if none: "No physical description provided"), role (lead|supporting|minor|extra|mentioned), personality, voice_only (bool)}]. Include creatures/animals with on-screen presence in this episode.
- scenes: [{scene_number, location (clean name), time_of_day, scene_type (real|dream|fantasy|flashback|montage), action_summary (2-4 sentences), mood, props[], wardrobe[{character,description}], characters_present[]}]
- locations: [{name, description, time_of_day, mood}] — unique, deduped, clean names (no verbose compound strings).
- structure: {acts[{act_number,title,description,scene_range:[s,e]}], episode_title, genre, logline, themes[]}
- setting_profile: {era, technology_level, wardrobe_rules[], forbidden[] (exhaustive concrete anachronisms for the era)}
Use null/[] when absent. Never invent.`;

async function extractStory(text) {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 8192, system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content: `Analyze and extract:\n\n${text.slice(0, 180000)}` }],
  });
  const raw = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("extraction returned no JSON");
  return JSON.parse(m[0]);
}

// classify which text is the script (longest with dialogue/scene cues usually)
function pickScriptAndBible(texts) {
  const read = texts.map(f => ({ f, t: fs.readFileSync(f, "utf8") }));
  read.sort((a, b) => b.t.length - a.t.length);
  // a "bible"/"spec" file (character physical descriptions) + the episode script
  const bible = read.find(r => /bible|spec|character|production/i.test(path.basename(r.f)));
  const script = read.find(r => /ep\d|episode|script|scene/i.test(path.basename(r.f))) || read[0];
  return { scriptText: script?.t || "", bibleText: bible && bible.f !== script?.f ? bible.t : "", scriptFile: script?.f, bibleFile: bible?.f };
}

// ── vision classify a loose image ───────────────────────────────────
async function classifyImage(file) {
  const { mime, b64 } = toDataUrl(file, 768);
  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 250,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text: `Classify this film production asset. Return ONLY JSON: {"kind":"headshot|pose_sheet|location|prop|storyboard|other","subject":"<short description of who/what>","text_seen":"<any legible text or empty>"}` },
      ] }],
    });
    const m = r.content.filter(b => b.type === "text").map(b => b.text).join("").match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

// best-fit an image subject to an entity list via Claude
async function matchSubject(subject, entities, kindLabel) {
  if (!entities.length) return null;
  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 60,
      messages: [{ role: "user", content: `A ${kindLabel} image shows: "${subject}". Which of these best matches? Reply ONLY the exact name or "none".\n${entities.map(e => `- ${e.name}: ${(e.description || "").slice(0, 120)}`).join("\n")}` }],
    });
    const ans = r.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    return entities.find(e => norm(e.name) === norm(ans)) || null;
  } catch { return null; }
}

// ── MAIN ────────────────────────────────────────────────────────────
(async () => {
  if (!texts.length) { console.error("No .md/.txt script found in folder."); process.exit(1); }
  const { scriptText, bibleText, scriptFile, bibleFile } = pickScriptAndBible(texts);
  log(`Script: ${scriptFile ? path.basename(scriptFile) : "—"}${bibleFile ? ` · Bible: ${path.basename(bibleFile)}` : ""}`);
  log(`\n🧠 Extracting story locally (Claude — bypasses the 60s deploy cap)…`);
  const story = await extractStory([scriptText, bibleText].filter(Boolean).join("\n\n---\n\n"));
  log(`   → ${story.characters?.length || 0} characters, ${story.scenes?.length || 0} scenes, ${story.locations?.length || 0} locations, setting era: ${story.setting_profile?.era || "—"}`);

  // ── classify + match images ──
  const elementMap = opt("element-map") && fs.existsSync(opt("element-map")) ? JSON.parse(fs.readFileSync(opt("element-map"), "utf8")) : {};
  const charByNorm = Object.fromEntries((story.characters || []).map(c => [norm(c.name), c]));
  const locByNorm = Object.fromEntries((story.locations || []).map(l => [norm(l.name), l]));
  const assigned = { characters: {}, locations: {}, props: [] }; // name -> {headshot, pose_sheet, references[], element}

  log(`\n🔎 Classifying ${images.length} images…`);
  for (const img of images) {
    const conv = conventionOf(img);
    let entityKind, entityName, assetKind;
    if (conv) { ({ entityKind, entityName, assetKind } = conv); }
    else {
      const c = await classifyImage(img);
      if (!c || c.kind === "other") continue;
      assetKind = c.kind === "pose_sheet" ? "pose_sheet" : c.kind === "headshot" ? "headshot" : "reference";
      entityKind = (c.kind === "headshot" || c.kind === "pose_sheet") ? "character" : c.kind === "location" ? "location" : "prop";
      // match subject to an entity
      const pool = entityKind === "character" ? story.characters || [] : entityKind === "location" ? story.locations || [] : [];
      const hit = charByNorm[norm(c.subject)] || locByNorm[norm(c.subject)] || await matchSubject(c.subject, pool, entityKind);
      entityName = hit?.name || c.subject;
    }
    // resolve to a story entity by normalized name (fuzzy contains)
    if (entityKind === "character") {
      const ent = charByNorm[norm(entityName)] || findEntity(story.characters || [], entityName);
      if (!ent) { log(`   ? unmatched character image: ${path.basename(img)} (guess: ${entityName})`); continue; }
      const a = assigned.characters[ent.name] || (assigned.characters[ent.name] = { references: [] });
      if (assetKind === "pose_sheet") a.pose_sheet = img; else a.headshot = a.headshot || img;
    } else if (entityKind === "location") {
      const ent = locByNorm[norm(entityName)] || findEntity(story.locations || [], entityName);
      if (!ent) { log(`   ? unmatched location image: ${path.basename(img)} (guess: ${entityName})`); continue; }
      const a = assigned.locations[ent.name] || (assigned.locations[ent.name] = { references: [] });
      a.references.push(img);
    } else {
      assigned.props.push({ name: entityName, image: img });
    }
  }
  // element ids from the map — token-overlap match, attach to ALL matches
  // (a "The Driftwood" element applies to Driftwood Exterior + Interior).
  for (const [name, id] of Object.entries(elementMap)) {
    for (const c of (story.characters || []).filter((c) => nameMatch(c.name, name)))
      (assigned.characters[c.name] = assigned.characters[c.name] || { references: [] }).element = id;
    for (const l of (story.locations || []).filter((l) => nameMatch(l.name, name)))
      (assigned.locations[l.name] = assigned.locations[l.name] || { references: [] }).element = id;
  }
  const provided = { ch: Object.entries(assigned.characters), loc: Object.entries(assigned.locations) };
  log(`   → matched headshots: ${provided.ch.filter(([, a]) => a.headshot).length}, pose sheets: ${provided.ch.filter(([, a]) => a.pose_sheet).length}, location refs: ${provided.loc.length}, props: ${assigned.props.length}`);

  if (DRY) { log("\n--dry: stopping before any DB write.\n"); printReadiness(story, assigned, elementMap); return; }

  // ── create/seed project + write extraction ──
  let projectId = opt("project-id");
  if (!projectId) {
    const res = await fetch(`${BASE}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: TITLE, type: "personal", mode: "auto", aspect_ratio: ASPECT }) });
    projectId = (await res.json()).id;
    log(`\n📦 Project created: ${projectId}`);
  }
  await seedExtraction(projectId, story, scriptText, RUNTIME);
  await attachLocks(projectId, story, assigned);

  // ── readiness ──
  const report = printReadiness(story, assigned, elementMap);

  if (FILL) await fillAndRun(projectId, story, assigned, report);
  else log(`\n(report-only — re-run with --run to fill gaps and build the episode)\n`);
  log(`\n✅ Intake complete for project ${projectId}\n   ${BASE}/projects/${projectId}\n`);
})().catch(e => { console.error("\nINTAKE FAILED:", e.message); process.exit(1); });

// ── seed extraction into DB (mirrors /api/extract writes) ───────────
async function seedExtraction(pid, story, scriptText, runtime) {
  for (const t of ["storyboard_panels", "scene_variations", "scenes", "location_variations", "locations", "character_poses", "cast_variations", "characters", "extractions"]) { try { await supabase.from(t).delete().eq("project_id", pid); } catch {} }
  await supabase.from("characters").insert((story.characters || []).map(c => ({ project_id: pid, name: c.name, description: c.description || "", role: ["lead","supporting","minor","extra","mentioned"].includes(c.role) ? c.role : "minor", personality: c.personality || "", voice_only: !!c.voice_only })));
  await supabase.from("locations").insert((story.locations || []).map(l => ({ project_id: pid, name: l.name, description: l.description || "", time_of_day: l.time_of_day || "", mood: l.mood || "" })));
  const { data: locRows } = await supabase.from("locations").select("id,name").eq("project_id", pid);
  const locId = Object.fromEntries((locRows || []).map(l => [norm(l.name), l.id]));
  await supabase.from("scenes").insert((story.scenes || []).map(s => ({ project_id: pid, scene_number: s.scene_number, location: s.location, location_id: locId[norm(s.location)] || null, time_of_day: s.time_of_day || "", scene_type: ["real","dream","fantasy","flashback","montage"].includes(s.scene_type) ? s.scene_type : "real", action_summary: s.action_summary || "", mood: s.mood || "", props: s.props || [], wardrobe: s.wardrobe || [], characters_present: s.characters_present || [], locked: false })));
  await supabase.from("extractions").insert({ project_id: pid, structure: story.structure || {}, raw_response: "intake.mjs (local extraction)" });
  // Shot-density cap (≈1 shot / 4s) + era ride in production_notes so the
  // storyboard breakdown stops over-generating for short-form (no schema change).
  const sp = story.setting_profile || {};
  const targetShots = Math.max(8, Math.round(runtime / 4));
  const notes = [
    `TARGET RUNTIME: ${runtime}s — the ENTIRE episode must total roughly ${targetShots} shots (about ${Math.max(1, Math.round(targetShots / Math.max(1, (story.scenes || []).length)))} per scene). Do NOT exceed ${Math.round(targetShots * 1.3)} shots total. Favor fewer, stronger shots.`,
    sp.era ? `ERA: ${sp.era}.` : "",
    sp.forbidden?.length ? `NEVER depict: ${sp.forbidden.slice(0, 12).join("; ")}.` : "",
    `Characters and locations that have a locked reference image must match it exactly.`,
  ].filter(Boolean).join(" ");
  await supabase.from("projects").update({ script_text: (scriptText || "").slice(0, 200000), setting_profile: story.setting_profile || null, production_notes: notes, phase_status: "bible" }).eq("id", pid);
}

// ── attach provided assets as locks ─────────────────────────────────
async function attachLocks(pid, story, assigned) {
  const { data: chars } = await supabase.from("characters").select("id,name").eq("project_id", pid);
  for (const [name, a] of Object.entries(assigned.characters)) {
    const ch = (chars || []).find(c => nameMatch(c.name, name)); if (!ch) continue;
    if (a.headshot) {
      const { dataUrl } = toDataUrl(a.headshot);
      const { data: v } = await supabase.from("cast_variations").insert({ character_id: ch.id, project_id: pid, image_url: dataUrl, prompt_used: "intake-locked", variation_number: 1, status: "approved" }).select("id").single();
      if (v) await supabase.from("characters").update({ approved_cast_id: v.id, locked: true }).eq("id", ch.id);
    }
    if (a.pose_sheet) { const { dataUrl } = toDataUrl(a.pose_sheet); await supabase.from("characters").update({ pose_sheet_url: dataUrl }).eq("id", ch.id); }
    if (a.element) await supabase.from("characters").update({ higgsfield_element_id: a.element }).eq("id", ch.id);
  }
  const { data: locs } = await supabase.from("locations").select("id,name").eq("project_id", pid);
  for (const [name, a] of Object.entries(assigned.locations)) {
    const lc = (locs || []).find(l => nameMatch(l.name, name)); if (!lc) continue;
    // The element attaches even to a location with no provided reference (a
    // shared "Driftwood" element applies to its Interior too — that scout is a gap).
    if (a.element) await supabase.from("locations").update({ higgsfield_element_id: a.element }).eq("id", lc.id);
    if (!a.references.length) continue;
    const { dataUrl } = toDataUrl(a.references[0]);
    await supabase.from("locations").update({ approved_image_url: dataUrl, locked: true }).eq("id", lc.id);
    // scene scouts: scenes at this location inherit the reference
    const { data: scs } = await supabase.from("scenes").select("id,location").eq("project_id", pid);
    for (const sc of (scs || []).filter(s => nameMatch(s.location, name))) {
      try { await supabase.from("scenes").update({ approved_scout_image_url: dataUrl }).eq("id", sc.id); } catch {}
    }
  }
}
function locByContains(a, b) { return norm(a).includes(norm(b)) || norm(b).includes(norm(a)); }

// ── readiness report ────────────────────────────────────────────────
function printReadiness(story, assigned, elementMap) {
  const gaps = []; const autoGen = [];
  log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`PROJECT READINESS — ${TITLE}`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`\nCHARACTERS            desc  headshot  pose   element`);
  for (const c of (story.characters || [])) {
    if (c.voice_only) continue;
    const a = assigned.characters[c.name] || {};
    const desc = (c.description && !/no physical/i.test(c.description)) ? "✓" : "✗";
    const hs = a.headshot ? "✓(you)" : "→gen"; if (!a.headshot) autoGen.push(`cast ${c.name}`);
    const ps = a.pose_sheet ? "✓(you)" : "→gen"; if (!a.pose_sheet) autoGen.push(`pose ${c.name}`);
    const el = a.element ? "✓" : "→gen"; if (!a.element) autoGen.push(`element ${c.name}`);
    if (desc === "✗") gaps.push(`${c.name} has no description (needs your input or a bible)`);
    log(`  ${c.name.padEnd(20)} ${desc.padEnd(5)} ${hs.padEnd(9)} ${ps.padEnd(6)} ${el}`);
  }
  log(`\nLOCATIONS             desc  reference  element`);
  for (const l of (story.locations || [])) {
    const a = assigned.locations[l.name] || {};
    const ref = a.references?.length ? "✓(you)" : "→gen"; if (!a.references?.length) autoGen.push(`scout ${l.name}`);
    const el = a.element ? "✓" : "→derive";
    log(`  ${l.name.slice(0,20).padEnd(20)} ${"✓".padEnd(5)} ${ref.padEnd(10)} ${el}`);
  }
  const scoutCount = (story.scenes || []).length;
  log(`\nSCENES   ${scoutCount} scenes — storyboard + first frames will generate.`);
  log(`\nSUMMARY: ${autoGen.length} pieces the system will auto-generate, ${gaps.length} need your input.`);
  if (gaps.length) gaps.forEach(g => log(`   ⚠ ${g}`));
  log(`Everything you provided is LOCKED and will NOT be regenerated.`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  return { gaps, autoGen, charGaps: (story.characters || []).filter(c => !c.voice_only && !assigned.characters[c.name]?.headshot), locGaps: (story.locations || []).filter(l => !assigned.locations[l.name]?.references?.length) };
}

// ── fill gaps + run ─────────────────────────────────────────────────
async function fillAndRun(pid, story, assigned, report) {
  // Start the orchestrator at the earliest step that still has a gap.
  // With the I4 skip-list deployed, generate steps skip locked entities, so
  // only gaps generate. If everything is provided, start at storyboard.
  let start = "storyboard";
  if (report.charGaps.length) start = "cast_generate";
  else if (report.locGaps.length) start = "locations_generate";
  else if ((story.scenes || []).some(s => true) && false) start = "scenes_generate";
  log(`▶ Starting pipeline at "${start}" (${report.charGaps.length} character gaps, ${report.locGaps.length} location gaps)…`);
  await fetch(`${BASE}/api/projects/${pid}/auto-pipeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", start_from_step: start }) });
  if (!DO_RUN) { log("  (--fill-gaps without --run: pipeline started; drive it from the Auto Pilot page or re-run with --run)"); return; }
  log(`  driving to completion…`);
  let i = 0, fails = 0;
  while (i++ < 400) {
    const r = await fetch(`${BASE}/api/projects/${pid}/auto-pipeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "step" }) }).then(x => x.json()).catch(() => ({}));
    const run = r.run || {};
    if (r.work) log(`   ${run.current_step}: ${r.work}`);
    if (run.status === "completed" || run.current_step === "done") { log("   ✔ pipeline done"); break; }
    if (run.status === "failed") { if (++fails >= 3) { log("   aborted after failures"); break; } await fetch(`${BASE}/api/projects/${pid}/auto-pipeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }) }); }
    else fails = 0;
    await new Promise(s => setTimeout(s, 1200));
  }
}
