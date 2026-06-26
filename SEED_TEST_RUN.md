# Seeded Pipeline Test Run — LOLM S1E1 "Don't Touch That Place"

## What This Is

This is a **test run** of the auto-pipeline using Khalil's pre-curated character headshots, pose sheets, and Driftwood location references instead of auto-generated Gemini images. The pipeline will skip casting/location scouting entirely and go straight to storyboard generation, using the locked reference images as Gemini's multimodal identity/environment anchors.

## Why This Matters

Both `storyboard` and `first_frames` steps pass approved images directly to Gemini as multimodal references:
- **Character headshots** (`cast_variations.image_url` via `approved_cast_id`) → "Identity reference for {name} — match face, hair, build exactly"
- **Scene scout images** (`scenes.approved_scout_image_url`) → "Environment / lighting / color reference"
- **Previous panel frames** (first frames only) → continuity between shots

By seeding these with Khalil's hand-curated references (real headshots, real Driftwood photos), the storyboard and first frames will maintain visual consistency with the production's locked look.

---

## Step-by-Step Procedure

### Step 1: Create the Project

```bash
curl -X POST https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/projects \
  -H "Content-Type: application/json" \
  -d '{"title": "LOLM S1E1 — Seeded Test", "type": "short_film"}'
```

Save the returned `project_id`. You'll need it for every subsequent step.

### Step 2: Upload the Script

The episode script is at:
```
/Users/khalilchapman/Desktop/The Life of The Lazy Mon/Season 1 - We Bought a Bar/Ep01_DontTouchThatPlace.md
```

Upload it:
```bash
curl -X POST https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/upload \
  -F "project_id=<PROJECT_ID>" \
  -F "file=@/Users/khalilchapman/Desktop/The Life of The Lazy Mon/Season 1 - We Bought a Bar/Ep01_DontTouchThatPlace.md"
```

### Step 3: Run Extraction

```bash
curl -X POST https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/extract \
  -H "Content-Type: application/json" \
  -d '{"project_id": "<PROJECT_ID>"}'
```

This calls Claude to parse the script into characters, locations, and scenes. Wait for completion (up to 60s). The extraction will create DB records for ~3 characters (KHALIL, NICOLE, LOCAL MAN), ~6 locations, and ~6 scenes.

**IMPORTANT:** The exact location names may vary between extraction runs. The seed script has fuzzy matching built in, but if names differ significantly from the previous run, update the `LOCATION_ASSETS` map in `scripts/seed-locked-assets.mjs`.

Previous run produced these location names:
- Beach Road - Puerto Viejo
- The Driftwood - Exterior and Interior
- The Driftwood - Sensory Detail
- The Driftwood - Nicole's Moment
- The Driftwood - The Sign
- The Driftwood - Cliffhanger

### Step 4: Set Production Notes

After extraction, update the project's `production_notes` with the visual language spec. This gets injected into every Gemini generation prompt.

```bash
curl -X PATCH https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/projects/<PROJECT_ID> \
  -H "Content-Type: application/json" \
  -d '{
    "production_notes": "ERA: 2010 Costa Rica. CAMERA: ARRI Alexa 35 + Cooke S5/i anamorphic lenses. FILM STOCK: Kodak Vision3 500T grain structure. ASPECT RATIO: 2.39:1 anamorphic. COLOR: Warm Caribbean palette — sun-bleached wood, turquoise water, golden hour amber. The Driftwood is a two-story open-air wood-on-stilts beach bar with hand-painted signage, weathered timber, rope railings, and a thatched palapa roof. NOT modern concrete — rustic Caribbean beach architecture. Characters must look EXACTLY like their reference headshots. Khalil: late-20s Black American man, medium-dark skin, low fade, trim build, 2010 casual island wear. Nicole: late-20s Black American woman, warm brown skin, shoulder-length curls, natural beauty. Local Man: weathered Caribbean local, sun-darkened skin, salt-and-pepper stubble, worn clothing, rides a rusty bicycle."
  }'
```

### Step 5: Run the Seed Script

```bash
cd /Users/khalilchapman/Desktop/ai-film-pipeline
node scripts/seed-locked-assets.mjs <PROJECT_ID>
```

This reads images from the LOLM folder, base64 encodes them, and inserts them into the DB:

**Characters seeded:**
| Character | Headshot | Pose Sheet | Higgsfield Element |
|-----------|----------|------------|-------------------|
| KHALIL | `Characters/Khalil/Khalil Headshot 2.26.png` | `Characters/Khalil/Khalil pose sheet 2.26.png` | `3dadc9be-05cc-48f6-b34c-141500ec9cb4` (@Khalil4.26) |
| NICOLE | `Characters/Nicole/Nicole Headshot 6.18.png` | `Characters/Nicole/Nicole Pose Sheet 6.18.png` | `5ab95090-56d9-458b-a572-8dfbc7cfa9e9` (@Nicole) |
| LOCAL MAN | `Generated Assets/Characters/Local Man/Local_Man_OptionA_Headshot.png` | — | `aaee0ad6-9c70-423b-af6a-bc95a7be5694` (@Local-Man) |

**Locations seeded:**
| Location | Reference Image | Higgsfield Element |
|----------|----------------|-------------------|
| Beach Road - Puerto Viejo | `Generated Assets/Locations/PuertoViejo_BeachRoad_Keyframe.png` | — |
| The Driftwood - Exterior and Interior | `Generated Assets/Locations/Driftwood-NewExterior-Wide-16x9-v1.png` | `5eeb00a7-da34-4e78-9482-c1d122466cf1` |
| The Driftwood - Sensory Detail | `Generated Assets/Locations/Driftwood_Interior_Abandoned_Keyframe.png` | `5eeb00a7-da34-4e78-9482-c1d122466cf1` |
| The Driftwood - Nicole's Moment | `Generated Assets/Locations/Driftwood-NewInterior-Matched-16x9-v1.png` | `5eeb00a7-da34-4e78-9482-c1d122466cf1` |
| The Driftwood - The Sign | `Locations/The Driftwood/Driftwood_Hero_V4_SignShot.png` | `5eeb00a7-da34-4e78-9482-c1d122466cf1` |
| The Driftwood - Cliffhanger | `Locations/The Driftwood/Driftwood_BeachAngle_Reference.jpg` | `5eeb00a7-da34-4e78-9482-c1d122466cf1` |

**Scene scouts:** Each scene gets the same reference image as its linked location (location name matching).

### Step 6: Start Pipeline — Storyboard Only (Shot Breakdown)

```bash
curl -X POST https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/projects/<PROJECT_ID>/auto-pipeline \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "start_from_step": "storyboard"}'
```

**IMPORTANT:** The storyboard step does TWO things: (1) Claude breaks scenes into shots — this is the shot breakdown. (2) Gemini renders thumbnail art for each panel. The shot breakdown is the critical output. The Gemini thumbnails serve as rough visual guides but will NOT be identity-accurate for characters (Gemini scores 2-6/10 on identity fidelity).

After the storyboard step completes, **STOP the pipeline**. Do not let it continue to first_frames via Gemini. Instead, proceed to Step 7.

### Step 7: Hybrid Generation via Higgsfield (Character-Accurate Frames)

This is the key step that makes frames TRUE to the locked character elements. Instead of letting Gemini generate first frames (which drifts from references), we route character-featuring shots through Higgsfield Elements.

**Routing logic:**
- **Panels with characters** → Higgsfield `nano_banana_2` with @element handles
- **Environment-only panels** (no characters) → Gemini is fine (scores 9-10/10 on environments)

#### 7a. Query panels from Supabase

```sql
SELECT sp.id, sp.scene_number, sp.shot_number, sp.shot_type, sp.camera_angle,
       sp.description, sp.characters_in_shot, s.location
FROM storyboard_panels sp
JOIN scenes s ON s.scene_number = sp.scene_number AND s.project_id = sp.project_id
WHERE sp.project_id = '<PROJECT_ID>'
ORDER BY sp.scene_number, sp.shot_number;
```

#### 7b. For each panel with characters, build a Higgsfield prompt

Use `@element_handle` directly in the prompt text. Higgsfield resolves them automatically.

**Element handle map for LOLM:**
- KHALIL → `@Khalil4.26`
- NICOLE → `@Nicole`
- LOCAL MAN → `@Local-Man`
- Driftwood exterior → `@The-Driftwood-NewExterior`
- Driftwood interior (abandoned) → `@Driftwood-Interior-Abandoned`
- Driftwood interior (alive) → `@Driftwood-NewInterior`
- Beach road → `@PuertoViejo-BeachRoad`

**Prompt structure** (keep under ~200 tokens):
```
{shot_type}, {camera_angle}, @Character1 and @Character2 in @Location, {action/emotion},
cinematic 4K, ARRI Alexa 35, Cooke anamorphic, Kodak Vision3 500T grain, warm Caribbean golden hour
```

**Example prompts:**

Panel: "Khalil and Nicole walk through The Driftwood interior for the first time"
```
medium wide shot, eye level, @Khalil4.26 and @Nicole in @Driftwood-Interior-Abandoned,
walking through dusty abandoned bar interior with wonder and trepidation,
cinematic 4K, ARRI Alexa 35, Cooke anamorphic, warm Caribbean light streaming through boarded windows
```

Panel: "Close-up of Khalil touching the Driftwood sign"
```
close-up, low angle, @Khalil4.26 reaching toward @Driftwood-Sign-Hand,
hand touching weathered hand-painted sign with reverence, @Khalil-2010-Wardrobe,
cinematic 4K, ARRI Alexa 35, Cooke anamorphic, golden hour rim light
```

#### 7c. Generate via Higgsfield MCP

For each character panel, call:
```
generate_image({
  model: "nano_banana_2",
  prompt: "<element-tagged prompt>",
  aspect_ratio: "16:9",
  count: 2
})
```

Then poll results:
```
job_display({ ids: ["<job_id>"] })
```

#### 7d. Save results back to Supabase

For each completed generation, update the panel's image:
```sql
UPDATE storyboard_panels
SET image_url = '<base64_or_url>',
    generation_method = 'higgsfield',
    higgsfield_job_id = '<job_id>'
WHERE id = '<panel_id>';
```

### Step 8: Monitor Progress

Open the pipeline UI and navigate to the project:
```
https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/projects/<PROJECT_ID>
```

Or poll status:
```bash
curl https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/api/projects/<PROJECT_ID>/auto-pipeline
```

---

## Hybrid Generation Architecture

### Why Hybrid?

Test results showed:
- **Gemini** scores 9-10/10 on environments but only 2-6/10 on character identity
- **Higgsfield Elements** are trained identity models that preserve likeness perfectly
- Solution: Gemini for environment-only shots, Higgsfield for anything with characters

### Routing Decision Tree

```
Panel has characters in shot?
├── YES → Any character has higgsfield_element_id?
│   ├── YES → Route to Higgsfield (nano_banana_2 + @element handles)
│   └── NO  → Route to Gemini (with headshot multimodal refs as before)
└── NO  → Route to Gemini (environment-only, no identity concern)
```

### Prompt Builder

`src/lib/build-higgsfield-prompt.ts` provides:
- `buildHiggsfieldPrompt()` — constructs element-tagged prompts from panel data
- `categorizePanels()` — splits panels into Higgsfield vs Gemini routing

### Generation Flow (Cowork-Orchestrated)

The Higgsfield generation step runs from Cowork (not Vercel) because the Higgsfield MCP connector is available in Cowork. The flow:

1. Pipeline runs storyboard step on Vercel → shot breakdown + Gemini thumbnails
2. Cowork reads panels from Supabase
3. Cowork categorizes panels (character vs. environment)
4. For character panels: Cowork calls Higgsfield MCP `generate_image` with element-tagged prompts
5. Cowork polls for results via `job_display`
6. Cowork saves completed frames back to Supabase
7. Pipeline resumes from video_clips step

---

## Troubleshooting

### Location names don't match
The seed script uses fuzzy matching (checks if the location name contains the first part of the key). If extraction produces very different names, edit the `LOCATION_ASSETS` keys in `scripts/seed-locked-assets.mjs` to match.

After seeding, verify with:
```sql
SELECT name, approved_image_url IS NOT NULL as has_image, locked
FROM locations WHERE project_id = '<PROJECT_ID>';
```

### Character names don't match
Character names must match EXACTLY (uppercase). The extraction should produce KHALIL, NICOLE, and LOCAL MAN. If different, update `CHARACTER_ASSETS` keys.

### Image too large for Supabase insert
Individual images over 5MB may cause issues. If an insert fails, resize the image or convert from PNG to JPEG to reduce size.

### Storyboard not using reference images
Verify the seed worked:
```sql
SELECT c.name, c.approved_cast_id, c.locked, cv.image_url IS NOT NULL as has_headshot
FROM characters c
LEFT JOIN cast_variations cv ON cv.id = c.approved_cast_id
WHERE c.project_id = '<PROJECT_ID>';
```

---

## File Paths Reference (All relative to LOLM root)

```
/Users/khalilchapman/Desktop/The Life of The Lazy Mon/
├── Characters/
│   ├── Khalil/
│   │   ├── Khalil Headshot 2.26.png          ← PRIMARY headshot
│   │   ├── Khalil pose sheet 2.26.png        ← PRIMARY pose sheet
│   │   ├── Khalil Board Short Pose Sheet.png
│   │   ├── Khalil Face Closeup 1.png
│   │   └── Khalil Face Closeup 2.png
│   └── Nicole/
│       ├── Nicole Headshot 6.18.png           ← PRIMARY headshot (June 2026)
│       └── Nicole Pose Sheet 6.18.png         ← PRIMARY pose sheet
├── Locations/
│   └── The Driftwood/
│       ├── Driftwood_Hero_V4_SignShot.png     ← CANONICAL hero (for sign scenes)
│       ├── Driftwood_BeachAngle_Reference.jpg
│       ├── Driftwood_BeachSide_Reference.jpg
│       ├── Driftwood_FrontRoad_Reference.jpg
│       ├── Driftwood_GoldenHour_Reference.jpg
│       └── Driftwood_Hero_V3_WideAngle.png
└── Season 1 - We Bought a Bar/
    ├── Ep01_DontTouchThatPlace.md             ← EPISODE SCRIPT
    ├── SEASON1_ProductionSpec.md
    └── Generated Assets/
        ├── Characters/
        │   ├── Khalil/Khalil_2010_CoverWardrobe_Sheet.png
        │   └── Local Man/
        │       ├── Local_Man_OptionA_Headshot.png    ← LOCAL MAN headshot
        │       └── Local_Man_OptionA_Bicycle_Reference.png
        └── Locations/
            ├── Driftwood-NewExterior-Wide-16x9-v1.png
            ├── Driftwood-NewInterior-Matched-16x9-v1.png
            ├── Driftwood_Interior_Abandoned_Keyframe.png
            ├── Driftwood_Interior_AliveFlash_Keyframe.png
            └── PuertoViejo_BeachRoad_Keyframe.png
```

---

## Higgsfield Element IDs

### Characters
| Element | ID | Tag |
|---------|-----|-----|
| Khalil | `3dadc9be-05cc-48f6-b34c-141500ec9cb4` | @Khalil4.26 |
| Nicole | `5ab95090-56d9-458b-a572-8dfbc7cfa9e9` | @Nicole |
| Local Man | `aaee0ad6-9c70-423b-af6a-bc95a7be5694` | @Local-Man |

### Locations (Environments)
| Element | ID | Tag |
|---------|-----|-----|
| The Driftwood (original) | `5eeb00a7-da34-4e78-9482-c1d122466cf1` | @The-Driftwood |
| Driftwood New Exterior | `09321d18-fca6-46bf-9a14-60ed9fef1a1a` | @The-Driftwood-NewExterior |
| Driftwood New Interior | `26f54bd0-f29f-4700-ad1a-658c40f261e4` | @Driftwood-NewInterior |
| Driftwood Interior Abandoned | `36d6d286-0705-4fba-b324-20ba592c58bc` | @Driftwood-Interior-Abandoned |
| Driftwood Interior Alive Flash | `0ffee670-b26c-4cdd-b5fa-3aa00c6b9062` | @Driftwood-Interior-AliveFlash |
| Puerto Viejo Beach Road | `b49cfbfe-4e0c-446a-b16b-d4211b92f397` | @PuertoViejo-BeachRoad |

### Props
| Element | ID | Tag |
|---------|-----|-----|
| Khalil 2010 Wardrobe | `90fb7e33-916c-4182-8e97-75f607d311ef` | @Khalil-2010-Wardrobe |
| Driftwood Sign Hand | `a5601e30-5890-4f6d-ba95-2d74dbca28d8` | @Driftwood-Sign-Hand |
