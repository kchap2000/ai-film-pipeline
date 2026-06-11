// One-off: upload WAYW pose sheets (base64 in characters.pose_sheet_url)
// to the public bucket so the Higgsfield MCP connector can import them
// as the second media on each character element.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROJECT_ID = "ce2c5a83-efb1-47d4-a3df-b6b279b42be8";

const { data: chars, error } = await supabase
  .from("characters")
  .select("id, name, pose_sheet_url")
  .eq("project_id", PROJECT_ID)
  .in("name", ["Rob", "Jeff"]);
if (error) throw error;

for (const c of chars) {
  const match = c.pose_sheet_url?.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[1].includes("svg")) {
    console.log(`skip ${c.name}: no real pose sheet`);
    continue;
  }
  const path = `elements/${PROJECT_ID}/posesheet-${c.name.toLowerCase()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("project-uploads")
    .upload(path, Buffer.from(match[2], "base64"), { contentType: match[1], upsert: true });
  if (upErr) throw upErr;
  const url = supabase.storage.from("project-uploads").getPublicUrl(path).data.publicUrl;
  console.log(`${c.name}\t${url}`);
}
