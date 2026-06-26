#!/usr/bin/env node
/**
 * Local extraction runner — mirrors /api/extract but with no Vercel function
 * timeout (the route caps at 60s and Claude Sonnet's full structured
 * extraction of a rich script exceeds it). Same model, same system prompt,
 * same DB writes. Reads the script straight from a local file.
 *
 * Usage: node scripts/extract-local.mjs <project_id> <path-to-script>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * ANTHROPIC_API_KEY from .env.local.
 */
import { readFileSync } from "node:fs";

const projectId = process.argv[2];
const scriptPath = process.argv[3];
if (!projectId || !scriptPath) {
  console.error("Usage: node scripts/extract-local.mjs <project_id> <path-to-script>");
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
const Anthropic = (await import("@anthropic-ai/sdk")).default;
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const documentText = readFileSync(scriptPath, "utf8");

const SYSTEM = `You are a professional script analyst and film production assistant. Your job is to read scripts, treatments, director notes, or any film production documents and extract structured production data.

You MUST respond with valid JSON only — no markdown, no commentary, no code fences. Your entire response must be parseable by JSON.parse().

SCENE GROUPING RULES (critical):
A) TRADITIONAL FORMAT (INT./EXT. scene headings): Each heading = one scene.
B) NUMBERED-SHOT / TIME-BLOCK FORMAT (numbered shots like "1.", "2." OR time blocks like "0:00-0:04 | HOOK"): Group consecutive shots that share the same location and time-of-day into ONE scene. A scene break happens when the location OR time-of-day changes, or at a clear CUT TO: or reality->dream shift. Aim for 4-8 scenes per typical short script. For a single-location episode, still split into a few scenes by dramatic beat (e.g. The Warning / The Building Pulls Him / Paradise With Teeth / The Name / The Cliffhanger) so each gets its own storyboard coverage. NEVER return zero scenes.

Extract:
1. characters — every speaking or physically present character (incl. creatures). For each: name, description (ALL physical details; if none: "No physical description provided in script — awaiting production notes."; use the EXACT relationship term the script uses), role (lead/supporting/minor/extra/mentioned), personality, voice_only (boolean — true if ONLY a voice/O.S./V.O.).
2. scenes — grouped per rules. For each: scene_number (sequential), location (clean name), time_of_day (day/night/dawn/dusk/morning/afternoon/golden hour), scene_type (real/dream/fantasy/flashback/montage), action_summary (2-4 sentences), mood, props (string[]), wardrobe (object[] of {character, description}), characters_present (string[] physically present).
3. locations — unique production locations from the scenes. For each: name (matching scene.location where possible), description (concrete visual production description from evidence; if none: "No visual location description provided in script — awaiting production notes."), time_of_day, mood.
4. structure: acts (array of {act_number, title, description, scene_range:[start,end]}), episode_title, genre, logline, themes (string[]).
5. setting_profile: era, technology_level, wardrobe_rules (string[]), forbidden (string[] of CONCRETE anachronisms that must NEVER appear).

If information is absent, use null or [] — never invent. Output exactly:
{ "characters": [...], "scenes": [...], "locations": [...], "structure": {...}, "setting_profile": {...} }`;

console.log(`Extracting ${scriptPath} (${documentText.length} chars) for project ${projectId}…`);
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  system: SYSTEM,
  messages: [{ role: "user", content: `Analyze the following document and extract all characters, scenes, locations, structure, and setting_profile as specified.\n\n---\n\n${documentText}` }],
});
const raw = message.content[0].type === "text" ? message.content[0].text : "";
const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
let extraction;
try {
  extraction = JSON.parse(cleaned);
} catch (e) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/extract_raw.json", raw);
  console.error(`JSON parse failed (${e.message}). raw length=${raw.length}, stop_reason=${message.stop_reason}`);
  console.error("LAST 500 chars:\n", raw.slice(-500));
  console.error("(full raw dumped to /tmp/extract_raw.json)");
  process.exit(1);
}
console.log(`Claude returned: ${extraction.characters?.length || 0} chars, ${extraction.scenes?.length || 0} scenes, ${extraction.locations?.length || 0} locations`);
if (!extraction.scenes?.length) {
  console.error("Refusing to write: 0 scenes. Aborting so we don't wipe existing data.");
  process.exit(1);
}

// Clean rebuild (mirrors the route)
await Promise.all([
  supabase.from("characters").delete().eq("project_id", projectId),
  supabase.from("scenes").delete().eq("project_id", projectId),
  supabase.from("locations").delete().eq("project_id", projectId),
  supabase.from("extractions").delete().eq("project_id", projectId),
]);

if (extraction.characters?.length) {
  const { error } = await supabase.from("characters").insert(
    extraction.characters.map((c) => ({
      project_id: projectId, name: c.name, description: c.description || "",
      role: c.role || "minor", personality: c.personality || "", voice_only: c.voice_only ?? false,
    }))
  );
  if (error) console.error("characters insert error:", error.message);
}

// Locations derived from scenes (+ explicit location descriptions)
const locByKey = {};
for (const l of extraction.locations || []) {
  const k = (l.name || "").toLowerCase().trim();
  if (k) locByKey[k] = l;
}
const sceneLocMeta = {};
const firstCased = {};
for (const s of extraction.scenes) {
  const k = (s.location || "").toLowerCase().trim();
  if (k && !sceneLocMeta[k]) sceneLocMeta[k] = { time_of_day: s.time_of_day || "", mood: s.mood || "" };
  if (k && !firstCased[k]) firstCased[k] = s.location;
}
const locNameToId = {};
const uniqueKeys = Object.keys(sceneLocMeta);
if (uniqueKeys.length) {
  const { data: insLocs, error } = await supabase.from("locations").insert(
    uniqueKeys.map((k) => ({
      project_id: projectId,
      name: firstCased[k] || k,
      description: locByKey[k]?.description || "No visual location description provided in script — awaiting production notes.",
      time_of_day: locByKey[k]?.time_of_day || sceneLocMeta[k].time_of_day,
      mood: locByKey[k]?.mood || sceneLocMeta[k].mood,
    }))
  ).select("id, name");
  if (error) console.error("locations insert error:", error.message);
  for (const l of insLocs || []) locNameToId[l.name.toLowerCase().trim()] = l.id;
}

const { error: sceneErr } = await supabase.from("scenes").insert(
  extraction.scenes.map((s) => ({
    project_id: projectId, scene_number: s.scene_number, location: s.location || "",
    location_id: locNameToId[(s.location || "").toLowerCase().trim()] || null,
    time_of_day: s.time_of_day || "", scene_type: s.scene_type || "real",
    action_summary: s.action_summary || "", mood: s.mood || "",
    props: s.props || [], wardrobe: s.wardrobe || [], characters_present: s.characters_present || [],
  }))
);
if (sceneErr) console.error("scenes insert error:", sceneErr.message);

await supabase.from("extractions").insert({ project_id: projectId, structure: extraction.structure || {}, raw_response: JSON.stringify(extraction) });
if (extraction.setting_profile) {
  await supabase.from("projects").update({ setting_profile: extraction.setting_profile, script_text: documentText.slice(0, 200000) }).eq("id", projectId);
} else {
  await supabase.from("projects").update({ script_text: documentText.slice(0, 200000) }).eq("id", projectId);
}
await supabase.from("projects").update({ phase_status: "casting" }).eq("id", projectId).in("phase_status", ["ingestion", "extraction", "bible"]);

const { count: sc } = await supabase.from("scenes").select("*", { count: "exact", head: true }).eq("project_id", projectId);
const { count: ch } = await supabase.from("characters").select("*", { count: "exact", head: true }).eq("project_id", projectId);
const { count: lo } = await supabase.from("locations").select("*", { count: "exact", head: true }).eq("project_id", projectId);
console.log(`✅ Wrote: ${ch} characters, ${sc} scenes, ${lo} locations.`);
