#!/usr/bin/env node
/**
 * seed-locked-assets.mjs
 *
 * Seeds the auto-pipeline DB with Khalil's curated character headshots,
 * pose sheets, and location reference images so the pipeline can skip
 * Steps 2-8 and go straight to storyboard generation.
 *
 * USAGE:
 *   node scripts/seed-locked-assets.mjs <PROJECT_ID>
 *
 * PREREQUISITES:
 *   - .env.local must exist with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - The project must already exist and extraction must have run (characters/locations/scenes in DB)
 *   - Image files must exist at the paths defined in ASSET_MAP below
 *
 * WHAT IT DOES:
 *   1. Reads each character's headshot + pose sheet from disk
 *   2. Base64 encodes them
 *   3. Inserts a cast_variation row with the headshot as image_url
 *   4. Updates the character: approved_cast_id, locked=true, pose_sheet_url
 *   5. Reads each location reference image from disk
 *   6. Updates the location: approved_image_url, locked=true
 *   7. Reads each scene's scout image from disk
 *   8. Updates the scene: approved_scout_image_url
 *   9. Sets higgsfield_element_id where applicable
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

// ── Load env ────────────────────────────────────────────────────────
const envPath = new URL("../.env.local", import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROJECT_ID = process.argv[2];
if (!PROJECT_ID) {
  console.error("Usage: node scripts/seed-locked-assets.mjs <PROJECT_ID>");
  process.exit(1);
}

// ── Base paths ──────────────────────────────────────────────────────
// Adjust these if Khalil's folder structure moves
const LOLM_ROOT = "/Users/khalilchapman/Documents/Claude/Projects/The Life of The Lazy Mon";
const CHARS_DIR = `${LOLM_ROOT}/Characters`;
const LOCS_DIR  = `${LOLM_ROOT}/Locations/The Driftwood`;
const GEN_DIR   = `${LOLM_ROOT}/Season 1 - We Bought a Bar/Generated Assets`;

// ── Asset map ───────────────────────────────────────────────────────
// Maps extracted character names (UPPERCASE as they appear in DB) to file paths
const CHARACTER_ASSETS = {
  "KHALIL": {
    headshot:   `${CHARS_DIR}/Khalil/Khalil Headshot 2.26.png`,
    poseSheet:  `${CHARS_DIR}/Khalil/Khalil pose sheet 2.26.png`,
    elementId:  "3dadc9be-05cc-48f6-b34c-141500ec9cb4", // @Khalil4.26
  },
  "NICOLE": {
    headshot:   `${CHARS_DIR}/Nicole/Nicole Headshot 6.18.png`,
    poseSheet:  `${CHARS_DIR}/Nicole/Nicole Pose Sheet 6.18.png`,
    elementId:  "5ab95090-56d9-458b-a572-8dfbc7cfa9e9", // @Nicole
  },
  "LOCAL MAN": {
    headshot:   `${GEN_DIR}/Characters/Local Man/Local_Man_OptionA_Headshot.png`,
    poseSheet:  null, // No pose sheet for Local Man yet
    elementId:  "aaee0ad6-9c70-423b-af6a-bc95a7be5694", // @Local-Man
  },
};

// Maps extracted location names (as they appear in DB after extraction) to reference images.
// The extraction for Ep01 "Don't Touch That Place" produces 6 locations.
// Adjust the keys below to match whatever names Claude extracts.
const LOCATION_ASSETS = {
  "Beach Road - Puerto Viejo": {
    image: `${GEN_DIR}/Locations/PuertoViejo_BeachRoad_Keyframe.png`,
    elementId: "b49cfbfe-4e0c-446a-b16b-d4211b92f397", // @PuertoViejo-BeachRoad
  },
  "The Driftwood - Exterior and Interior": {
    image: `${GEN_DIR}/Locations/Driftwood-NewExterior-Wide-16x9-v1.png`,
    elementId: "09321d18-fca6-46bf-9a14-60ed9fef1a1a", // @The-Driftwood-NewExterior
  },
  "The Driftwood - Sensory Detail": {
    image: `${GEN_DIR}/Locations/Driftwood_Interior_Abandoned_Keyframe.png`,
    elementId: "36d6d286-0705-4fba-b324-20ba592c58bc", // @Driftwood-Interior-Abandoned
  },
  "The Driftwood - Nicole's Moment": {
    image: `${GEN_DIR}/Locations/Driftwood-NewInterior-Matched-16x9-v1.png`,
    elementId: "26f54bd0-f29f-4700-ad1a-658c40f261e4", // @Driftwood-NewInterior
  },
  "The Driftwood - The Sign": {
    image: `${LOCS_DIR}/Driftwood_Hero_V4_SignShot.png`,
    elementId: "5eeb00a7-da34-4e78-9482-c1d122466cf1", // @The-Driftwood (original)
  },
  "The Driftwood - Cliffhanger": {
    image: `${LOCS_DIR}/Driftwood_BeachAngle_Reference.jpg`,
    elementId: "5eeb00a7-da34-4e78-9482-c1d122466cf1", // @The-Driftwood (original)
  },
};

// Scene scout images — maps scene location string (from scenes.location) to a reference image.
// These are used as "environment / lighting / color reference" in storyboard and first-frame generation.
// If a scene shares a location with LOCATION_ASSETS, it uses the same image by default.
// Override specific scenes here if you want a different atmosphere/angle than the location default.
const SCENE_SCOUT_OVERRIDES = {
  // scene_number → image path (overrides the location default)
  // Example: 3: `${GEN_DIR}/Locations/Driftwood_Interior_Abandoned_Keyframe.png`,
};

// ── Helpers ─────────────────────────────────────────────────────────
const MAX_SIZE_MB = 6; // Warn if file exceeds this (base64 adds ~33%)

function fileToBase64(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let buf = fs.readFileSync(filePath);
  let mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  let sizeMB = buf.length / (1024 * 1024);
  // Downscale oversized references to keep the single-row insert small and
  // the cast/scene image endpoints snappy (Khalil's headshot is ~8MB raw).
  // Re-encode to JPEG at max 1600px via macOS `sips` into a /tmp scratch.
  if (sizeMB > 3) {
    try {
      const tmp = `/tmp/seed_${randomUUID()}.jpg`;
      execSync(`sips -s format jpeg -s formatOptions 82 -Z 1600 ${JSON.stringify(filePath)} --out ${JSON.stringify(tmp)}`, { stdio: "ignore" });
      buf = fs.readFileSync(tmp);
      mime = "image/jpeg";
      fs.unlinkSync(tmp);
      console.log(`     ↓ downscaled ${path.basename(filePath)} ${sizeMB.toFixed(1)}MB → ${(buf.length / 1048576).toFixed(1)}MB jpg`);
      sizeMB = buf.length / (1024 * 1024);
    } catch (e) {
      console.log(`     ⚠️  downscale failed for ${path.basename(filePath)} (${e.message?.slice(0,60)}) — using original`);
    }
  }
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function fileExists(filePath) {
  try { fs.accessSync(filePath); return true; } catch { return false; }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎬 Seeding locked assets for project ${PROJECT_ID}\n`);

  // ── 1. Fetch extracted characters ────────────────────────────────
  const { data: characters, error: charErr } = await supabase
    .from("characters")
    .select("id, name, role, voice_only")
    .eq("project_id", PROJECT_ID);
  if (charErr) throw new Error(`Failed to fetch characters: ${charErr.message}`);
  console.log(`Found ${characters.length} characters: ${characters.map(c => c.name).join(", ")}`);

  // ── 2. Seed each character ──────────────────────────────────────
  for (const char of characters) {
    const assets = CHARACTER_ASSETS[char.name];
    if (!assets) {
      console.log(`  ⚠️  No assets mapped for "${char.name}" — skipping`);
      continue;
    }

    // Check headshot exists
    if (!fileExists(assets.headshot)) {
      console.log(`  ❌ Headshot not found: ${assets.headshot}`);
      continue;
    }

    console.log(`  📸 Seeding ${char.name}...`);

    // Read and encode headshot
    const headshotBase64 = fileToBase64(assets.headshot);
    const variationId = randomUUID();

    // Insert cast_variation row
    const { error: cvErr } = await supabase
      .from("cast_variations")
      .insert({
        id: variationId,
        character_id: char.id,
        project_id: PROJECT_ID,
        image_url: headshotBase64,
        prompt_used: "Seeded from locked reference — " + path.basename(assets.headshot),
        status: "approved",
        variation_number: 1,
      });
    if (cvErr) {
      console.log(`  ❌ Failed to insert cast_variation: ${cvErr.message}`);
      continue;
    }

    // Build character update
    const charUpdate = {
      approved_cast_id: variationId,
      locked: true,
    };

    // Add pose sheet if available
    if (assets.poseSheet && fileExists(assets.poseSheet)) {
      charUpdate.pose_sheet_url = fileToBase64(assets.poseSheet);
      console.log(`     ✅ Pose sheet: ${path.basename(assets.poseSheet)}`);
    } else {
      console.log(`     ⚠️  No pose sheet available`);
    }

    // Add Higgsfield element ID if available
    if (assets.elementId) {
      charUpdate.higgsfield_element_id = assets.elementId;
      console.log(`     ✅ Higgsfield element: ${assets.elementId}`);
    }

    // Update character record
    const { error: updateErr } = await supabase
      .from("characters")
      .update(charUpdate)
      .eq("id", char.id);
    if (updateErr) {
      console.log(`  ❌ Failed to update character: ${updateErr.message}`);
      continue;
    }

    console.log(`     ✅ Headshot locked: ${path.basename(assets.headshot)}`);
  }

  // ── 3. Fetch extracted locations ────────────────────────────────
  const { data: locations, error: locErr } = await supabase
    .from("locations")
    .select("id, name")
    .eq("project_id", PROJECT_ID);
  if (locErr) throw new Error(`Failed to fetch locations: ${locErr.message}`);
  console.log(`\nFound ${locations.length} locations: ${locations.map(l => l.name).join(", ")}`);

  // ── 4. Seed each location ──────────────────────────────────────
  for (const loc of locations) {
    const assets = LOCATION_ASSETS[loc.name];
    if (!assets) {
      // Try fuzzy match — location names can vary between extraction runs
      const fuzzyKey = Object.keys(LOCATION_ASSETS).find(k =>
        loc.name.toLowerCase().includes(k.toLowerCase().split(" - ")[0].toLowerCase())
      );
      if (fuzzyKey) {
        console.log(`  ⚠️  Fuzzy matched "${loc.name}" → "${fuzzyKey}"`);
        const fuzzyAssets = LOCATION_ASSETS[fuzzyKey];
        await seedLocation(loc, fuzzyAssets);
      } else {
        console.log(`  ⚠️  No assets mapped for location "${loc.name}" — skipping`);
      }
      continue;
    }
    await seedLocation(loc, assets);
  }

  async function seedLocation(loc, assets) {
    if (!fileExists(assets.image)) {
      console.log(`  ❌ Image not found: ${assets.image}`);
      return;
    }

    console.log(`  🏝️  Seeding ${loc.name}...`);
    const imageBase64 = fileToBase64(assets.image);

    const locUpdate = {
      approved_image_url: imageBase64,
      locked: true,
    };

    if (assets.elementId) {
      locUpdate.higgsfield_element_id = assets.elementId;
      console.log(`     ✅ Higgsfield element: ${assets.elementId}`);
    }

    const { error: updateErr } = await supabase
      .from("locations")
      .update(locUpdate)
      .eq("id", loc.id);
    if (updateErr) {
      console.log(`  ❌ Failed to update location: ${updateErr.message}`);
      return;
    }
    console.log(`     ✅ Approved image: ${path.basename(assets.image)}`);
  }

  // ── 5. Fetch extracted scenes and seed scout images ─────────────
  const { data: scenes, error: scnErr } = await supabase
    .from("scenes")
    .select("id, scene_number, location, location_id")
    .eq("project_id", PROJECT_ID)
    .order("scene_number");
  if (scnErr) throw new Error(`Failed to fetch scenes: ${scnErr.message}`);
  console.log(`\nFound ${scenes.length} scenes`);

  for (const scene of scenes) {
    // Check for scene-specific override first
    if (SCENE_SCOUT_OVERRIDES[scene.scene_number]) {
      const overridePath = SCENE_SCOUT_OVERRIDES[scene.scene_number];
      if (fileExists(overridePath)) {
        const imageBase64 = fileToBase64(overridePath);
        await supabase.from("scenes").update({ approved_scout_image_url: imageBase64 }).eq("id", scene.id);
        console.log(`  🎬 Scene ${scene.scene_number}: override → ${path.basename(overridePath)}`);
        continue;
      }
    }

    // Fall back to the location's approved image
    const locAssets = LOCATION_ASSETS[scene.location];
    if (locAssets && fileExists(locAssets.image)) {
      const imageBase64 = fileToBase64(locAssets.image);
      const { error: updateErr } = await supabase
        .from("scenes")
        .update({ approved_scout_image_url: imageBase64 })
        .eq("id", scene.id);
      if (updateErr) {
        console.log(`  ❌ Scene ${scene.scene_number}: ${updateErr.message}`);
        continue;
      }
      console.log(`  🎬 Scene ${scene.scene_number} (${scene.location}): ${path.basename(locAssets.image)}`);
    } else {
      // Try fuzzy match on location name
      const fuzzyKey = Object.keys(LOCATION_ASSETS).find(k =>
        scene.location.toLowerCase().includes(k.toLowerCase().split(" - ")[0].toLowerCase())
      );
      if (fuzzyKey) {
        const fuzzyAssets = LOCATION_ASSETS[fuzzyKey];
        if (fileExists(fuzzyAssets.image)) {
          const imageBase64 = fileToBase64(fuzzyAssets.image);
          await supabase.from("scenes").update({ approved_scout_image_url: imageBase64 }).eq("id", scene.id);
          console.log(`  🎬 Scene ${scene.scene_number}: fuzzy match → ${path.basename(fuzzyAssets.image)}`);
          continue;
        }
      }
      console.log(`  ⚠️  Scene ${scene.scene_number} (${scene.location}): no scout image available`);
    }
  }

  // ── 6. Summary ──────────────────────────────────────────────────
  console.log(`\n✅ Seed complete for project ${PROJECT_ID}`);
  console.log(`\nNext step: Start the pipeline from storyboard:`);
  console.log(`  POST ${env.NEXT_PUBLIC_SUPABASE_URL ? "https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app" : "<PIPELINE_URL>"}/api/projects/${PROJECT_ID}/auto-pipeline`);
  console.log(`  Body: { "action": "start", "start_from_step": "storyboard" }\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
