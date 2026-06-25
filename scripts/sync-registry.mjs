#!/usr/bin/env node
/**
 * Registry → Pipeline sync (continuity / change-management bridge).
 *
 * The bible's Higgsfield Element Registry (HIGGSFIELD_ELEMENTS.md / the LOCK
 * layer) is the source of truth for which element_id every recurring entity
 * binds to. The AI pipeline stores those bindings separately
 * (characters.higgsfield_element_id, locations.higgsfield_element_id,
 * project_elements). With no auto-sync, the pipeline drifts the moment the
 * registry is revised (vertical-fix locations, new Jing wardrobe, Khalil's
 * car pick, …).
 *
 * This tool re-points the pipeline onto the CURRENT canonical set, registers
 * recurring props as elements, and reports the impact (which scenes/shots
 * reference a changed element → must be regenerated).
 *
 * Usage:  node scripts/sync-registry.mjs <project_id> [--apply]
 *         (default is dry-run: prints the diff + impact, changes nothing)
 *
 * The CANONICAL map below is transcribed from the 2026-06-25 registry.
 * Keep it in lockstep with HIGGSFIELD_ELEMENTS.md (or parse that file).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PID = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!PID) { console.error("Usage: node scripts/sync-registry.mjs <project_id> [--apply]"); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// ── CANONICAL REGISTRY (2026-06-25 lock layer) ───────────────────
// characters: match by name (case-insensitive) → canonical face-lock element
const CANON_CHARACTERS = {
  "jing li greenhill": "998bfde7-97e8-4357-b7a5-b274f285cc78", // Jing-Pink-LOCKED
  "ying hui":          "d3f28913-1705-487d-afcd-8ad0461d3d2d", // Ying-SilverStreaks-LOCKED
  "zhang wang":        "240c6373-790e-4367-94f1-a483faf5984f", // Zhang-Wang-HS
  "connor nir":        "d0f84aee-ca6d-45da-8f71-9f36b85ef571", // Connor-Nir-HS
  "zhan bao":          "36d12a06-78c6-46bb-9244-3e2b07c84258",
  "ching shih":        "602e6b96-d7dc-4852-bbd0-95f38c8ed468",
  "john cushing":      "4a9e0afe-c4eb-4d8d-8566-bc14f54f8269",
  "dl":                "7c4675f5-3766-42b6-9780-9535716e1afd", // DL-GreenHill-HS
  "huifen":            "7bb07f0f-d9e2-45d1-803e-722039163966", // PB-Huifen-Yellow (latest)
  "the magistrate":    "65e763ed-2350-4ba2-9c1c-14969d91b697",
  "fei":               "e5e0e723-0427-49d6-a26c-0552f7d1573e", // PB-Fei-Creature
};
// locations: substring keyword (lowercased loc name includes key) → canonical VERTICAL element
const CANON_LOCATIONS = [
  { key: "san francisco luxury tower", id: "ffb07ce0-f3ac-4a67-90a2-7379ac087c41" }, // SF-Tower-V
  { key: "ying penthouse",             id: "f538f8e2-59d1-415a-8abd-f2f2b0610287" }, // Penthouse-V
  { key: "neptune",                    id: "103b1481-2fbd-476f-8054-f1b8bcb82f95" }, // Neptune-Deck-V
  { key: "canton market",              id: "6c808dd7-ec35-4cd9-95d7-559bb6239a39" },
  { key: "golden ghetto",              id: "42b7fe2a-1e51-4172-aaac-a18b5926bd6b" },
  { key: "canton docks",               id: "f4db0fb4-b1f0-4bc7-bbb7-fe7641c8c6fa" },
  { key: "courtroom",                  id: "6e9b2a40-47e0-4f97-a6ce-2a801818af40" },
  { key: "canton court",               id: "6e9b2a40-47e0-4f97-a6ce-2a801818af40" },
  { key: "prison",                     id: "99b088a7-8c30-4f14-ae4d-f0ecc3c1646d" },
  { key: "pirate hall",                id: "b48e22a3-b082-4669-8dde-355d47426307" },
  { key: "ching's stronghold",         id: "882c6221-e27c-495c-8e3c-0f819ceae77c" }, // shrine
];
// props/outfits → project_elements rows (kind, name, match_terms, element_id)
const CANON_PROPS = [
  { kind: "prop",   name: "Eye Locket",          terms: ["Eye Locket", "the locket", "locket"],            id: "1cd29283-f93e-4e97-987f-0391cae5b6e6" },
  { kind: "outfit", name: "Canton Pirate Outfit", terms: ["Canton pirate outfit", "pirate outfit", "pirate costume"], id: "9e951dbc-f590-4f44-ac05-e7775d82a031" },
  { kind: "prop",   name: "Green Immortals",     terms: ["Green Immortals", "jade immortals", "the immortals"], id: "4e677c69-66af-4902-a288-c79919451992" },
  { kind: "prop",   name: "Handcuffs",           terms: ["handcuffs"],                                     id: "1b2b8a9d-d384-4800-ab51-9cb98bca3b13" },
  { kind: "prop",   name: "Pirate Cutlass",      terms: ["cutlass", "curved blade"],                       id: "05a8d14c-b965-454a-9702-091d1c6ebf72" },
  { kind: "prop",   name: "2037 Beater Car",     terms: ["beater car", "beater"],                          id: "bfbd44a8-72f2-46c8-a92d-84531fe92321" }, // Khalil's pick
  { kind: "prop",   name: "The Watcher",         terms: ["the Watcher"],                                   id: "22dccc54-da36-47c3-8e1f-806c26444204" },
  { kind: "prop",   name: "Healing Gourd",       terms: ["healing gourd", "gourd"],                        id: "59109681-deac-4dfc-b477-f95755fbbb8a" },
];

writeFileSync(new URL("../canonical_registry.json", import.meta.url),
  JSON.stringify({ updated: "2026-06-25", characters: CANON_CHARACTERS, locations: CANON_LOCATIONS, props: CANON_PROPS }, null, 2));

const changes = { characters: [], locations: [], props: [] };

// ── characters ──
const { data: chars } = await sb.from("characters").select("id, name, higgsfield_element_id").eq("project_id", PID);
for (const c of chars || []) {
  const canon = CANON_CHARACTERS[(c.name || "").toLowerCase().trim()];
  if (canon && canon !== c.higgsfield_element_id) {
    changes.characters.push({ id: c.id, name: c.name, from: c.higgsfield_element_id, to: canon });
    if (APPLY) await sb.from("characters").update({ higgsfield_element_id: canon }).eq("id", c.id);
  }
}
// ── locations ──
const { data: locs } = await sb.from("locations").select("id, name, higgsfield_element_id").eq("project_id", PID);
for (const l of locs || []) {
  const lname = (l.name || "").toLowerCase();
  const match = CANON_LOCATIONS.find((m) => lname.includes(m.key));
  if (match && match.id !== l.higgsfield_element_id) {
    changes.locations.push({ id: l.id, name: l.name, from: l.higgsfield_element_id, to: match.id });
    if (APPLY) await sb.from("locations").update({ higgsfield_element_id: match.id }).eq("id", l.id);
  }
}
// ── props (project_elements upsert) ──
const { data: existingPE } = await sb.from("project_elements").select("id, kind, name, higgsfield_element_id").eq("project_id", PID);
const peByKey = Object.fromEntries((existingPE || []).map((r) => [`${r.kind}|${r.name.toLowerCase()}`, r]));
for (const p of CANON_PROPS) {
  const existing = peByKey[`${p.kind}|${p.name.toLowerCase()}`];
  if (!existing) {
    changes.props.push({ name: p.name, action: "insert", to: p.id });
    if (APPLY) await sb.from("project_elements").insert({
      project_id: PID, kind: p.kind, name: p.name, match_terms: p.terms,
      higgsfield_element_id: p.id, status: "element_ready",
      description: `Canonical bible element (registry 06-25). Lock in every shot that references "${p.name}".`,
    });
  } else if (existing.higgsfield_element_id !== p.id) {
    changes.props.push({ name: p.name, action: "repoint", from: existing.higgsfield_element_id, to: p.id });
    if (APPLY) await sb.from("project_elements").update({ higgsfield_element_id: p.id, match_terms: p.terms, status: "element_ready" }).eq("id", existing.id);
  }
}

// ── impact: which EP1 shots reference a re-pointed entity ──
const { data: scenes } = await sb.from("scenes").select("id, scene_number, location").eq("project_id", PID).lte("scene_number", 5);
const sceneIds = (scenes || []).map((s) => s.id);
const { data: panels } = await sb.from("storyboard_panels").select("scene_id, panel_number, characters_in_shot").in("scene_id", sceneIds);
const sceneNum = Object.fromEntries((scenes || []).map((s) => [s.id, s.scene_number]));
const changedCharNames = new Set(changes.characters.map((c) => c.name.toLowerCase()));
const changedLocIds = new Set(changes.locations.map((l) => l.id));
let affectedShots = 0;
for (const pnl of panels || []) {
  const hit = (pnl.characters_in_shot || []).some((n) => changedCharNames.has((n || "").toLowerCase()));
  if (hit) affectedShots++;
}
const affectedScenesByLoc = (scenes || []).filter((s) => changes.locations.some((l) => (s.location || "").toLowerCase().includes(CANON_LOCATIONS.find((m) => m.id === l.to)?.key || " "))).map((s) => s.scene_number);

// ── report ──
console.log(`\n=== REGISTRY → PIPELINE SYNC ${APPLY ? "(APPLIED)" : "(DRY RUN)"} — project ${PID} ===\n`);
console.log(`CHARACTERS re-pointed: ${changes.characters.length}`);
changes.characters.forEach((c) => console.log(`  ${c.name.padEnd(20)} ${String(c.from).slice(0,8)} -> ${c.to.slice(0,8)}`));
console.log(`\nLOCATIONS re-pointed: ${changes.locations.length}`);
changes.locations.forEach((l) => console.log(`  ${l.name.padEnd(34)} ${String(l.from).slice(0,8)||"(none)"} -> ${l.to.slice(0,8)} (vertical)`));
console.log(`\nPROPS registered/re-pointed: ${changes.props.length}`);
changes.props.forEach((p) => console.log(`  ${p.name.padEnd(22)} ${p.action} -> ${p.to.slice(0,8)}`));
console.log(`\nIMPACT (EP1): ~${affectedShots} character shots + scenes [${affectedScenesByLoc.join(", ")}] (location) reference a re-pointed element → must be regenerated.`);
console.log(APPLY ? "\n✅ Applied. Re-run first-frames/clips for the affected EP1 shots." : "\n(dry run — re-run with --apply to write)\n");
