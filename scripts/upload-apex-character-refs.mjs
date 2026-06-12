// Upload Apex Hunter locked headshots + pose sheets (base64 in DB) to the
// public bucket so the Higgsfield connector can import them as element
// medias. Also backfills projects.script_text from the local script PDF.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROJECT_ID = "35387c49-5a98-42ca-8e3a-7580db5e1591";

// Backfill script_text (extraction predates the script_text migration)
const SKIP_BACKFILL = true;
const pdfParse = SKIP_BACKFILL ? null : require("pdf-parse/lib/pdf-parse.js");
const pdfData = SKIP_BACKFILL ? null : await pdfParse(fs.readFileSync("/Users/khalilchapman/Downloads/Demo Script (2).pdf"));
if (!SKIP_BACKFILL) await supabase.from("projects").update({ script_text: pdfData.text.slice(0, 200000) }).eq("id", PROJECT_ID);
if (!SKIP_BACKFILL) console.log("script_text backfilled:", pdfData.text.length, "chars");

// Optional name filter: node script.mjs Name1,Name2
const ONLY = process.argv[2] ? process.argv[2].split(",") : null;
let charsQuery = supabase
  .from("characters")
  .select("id, name, approved_cast_id, pose_sheet_url")
  .eq("project_id", PROJECT_ID)
  .not("approved_cast_id", "is", null);
if (ONLY) charsQuery = charsQuery.in("name", ONLY);
const { data: chars, error } = await charsQuery;
if (error) throw error;

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const c of chars) {
  const out = { name: c.name, headshot: null, pose: null };
  // Approved headshot lives on cast_variations
  const { data: v } = await supabase
    .from("cast_variations")
    .select("image_url")
    .eq("id", c.approved_cast_id)
    .single();
  for (const [kind, url] of [
    ["headshot", v?.image_url],
    ["pose", c.pose_sheet_url],
  ]) {
    const m = url?.match(/^data:([^;]+);base64,(.+)$/);
    if (!m || m[1].includes("svg")) continue;
    // Versioned path: anon role can INSERT but not UPDATE storage objects,
    // so refreshed references get new paths instead of overwriting
    const version = process.argv[3] || "";
    const path = `elements/${PROJECT_ID}/${kind}-${slug(c.name)}${version ? `-${version}` : ""}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("project-uploads")
      .upload(path, Buffer.from(m[2], "base64"), { contentType: m[1], upsert: true });
    if (upErr) { console.error(c.name, kind, "ERR", upErr.message); continue; }
    out[kind] = supabase.storage.from("project-uploads").getPublicUrl(path).data.publicUrl;
  }
  console.log(JSON.stringify(out));
}
