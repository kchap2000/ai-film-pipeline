# AI Film Pipeline — End-to-End Bug Report
## WAYW Episode 2 Full Pipeline Test
**Date:** April 13, 2026
**Project:** What Are You Wearing — Episode 2
**Project ID:** `c0ee0350-b95d-4a45-8c8d-538e3e252395`
**Tester:** Claude (Cowork) acting as a real user through the live app
**App URL:** https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app

---

## Executive Summary

Went through all 8 pipeline phases end-to-end as a real user would — uploading real production headshots, generating AI content, approving/rejecting, and verifying against the actual Ep2 script and Production Decisions R2 document. The pipeline *works* — all 21 storyboard panels were generated with images across 3 scenes. But there are significant data integrity issues, missing UX features, and gaps between what the app produces and what the production actually needs.

**Final state:** 3 scenes, 21 panels (7 each), 83s estimated runtime, all BOARDED with images.

---

## CRITICAL BUGS (Must Fix)

### BUG-1: Locations Table Contains Episode 1 Data (Wrong Project)
**Severity:** CRITICAL
**Phase:** Location Scouting (Phase 6)
**What happened:** The `locations` table for this Ep2 project contains 3 Episode 1 beach locations instead of the correct Ep2 locations:
- "Beach - Exterior" (5 variations generated)
- "Beach House - Kitchen/Interior" (5 variations generated)
- "Beach House Kitchen - Interior" (5 variations generated)

**What it should be:** Based on the script and Production Decisions:
- "Donna's Bedroom" (INT, night) — Scenes 1 & 3
- "Donna's Kitchen" (INT, day) — Scene 2
- "Donna's Pool / Backyard" (EXT, day) — Scene 2, Background Option #5 SoCal Suburban / Kidney Pool

**Root cause:** The project was likely initialized with a test.txt from Episode 1, and while the scenes were re-extracted correctly with the Ep2 script, the locations table was never updated. The extraction pipeline may have only populated locations during the first extraction and skipped them on re-extraction.

**Impact:** 15 AI-generated location images are for completely wrong environments. All `location_id` fields on the 3 scenes are NULL — there's zero linkage between scenes and locations.

**Fix:** 
1. Delete the 3 wrong location rows and their 15 variations
2. Create correct Ep2 locations (Donna's Bedroom, Donna's Kitchen, Donna's Pool)
3. Link scenes to locations via `location_id`
4. Re-generate location scouting images for the correct environments
5. Investigate why re-extraction didn't update locations — the extraction pipeline should detect and replace stale location data

---

### BUG-2: Scene → Location Linkage is NULL for All Scenes
**Severity:** CRITICAL
**Phase:** Extraction / Location Scouting
**What happened:** All 3 scenes have `location_id: null`. The extraction pipeline creates locations and scenes independently but never links them.

**Impact:** The location scouting phase has no connection to the scenes it's supposed to serve. A user can't tell which location images correspond to which scenes.

**Fix:** The extraction step (Claude LLM parsing) should match each scene's `location` text field to a location row and set the `location_id` foreign key. Add a post-extraction step that fuzzy-matches scene locations to the locations table and populates the FK.

---

### BUG-3: Supabase Storage Bucket Was Private (Manual Fix Applied)
**Severity:** CRITICAL (was blocking all headshot uploads; manually fixed)
**Phase:** AI Casting (Phase 4)
**What happened:** The `project-uploads` Supabase Storage bucket was created with `public: false`. When the client-side upload flow stored a headshot and then called `getPublicUrl()`, the returned URL gave HTTP 400 "Bucket not found" because public access was disabled.

**Manual fix applied:** `UPDATE storage.buckets SET public = true WHERE id = 'project-uploads';`

**Permanent fix needed:** The `schema.sql` or migration script should ensure the bucket is created with `public: true` from the start. Add this to the Supabase setup documentation/migration.

---

## HIGH PRIORITY BUGS

### BUG-4: No Cancel Button for AI Generation
**Severity:** HIGH
**Phase:** AI Casting, Storyboard (any generation phase)
**What happened:** Accidentally clicked "Generate All (10 each)" on the casting page. There was no way to cancel or abort the generation. It burned through 30+ Gemini API calls generating AI casting variations for characters that already had real uploaded headshots.

**Fix:** Add a "Cancel" / "Stop Generation" button that sets an abort flag. The UI loop that calls POST per variation should check this flag between iterations and stop if set.

---

### BUG-5: No "Continue to Storyboard" Navigation on Scene Scout Page
**Severity:** HIGH
**Phase:** Scene Scouting → Storyboard transition
**What happened:** After approving all 3 scene scout images, there was no forward navigation button (like "Continue to Storyboard"). The cast page has "Continue to Character Lock" which works well, but this pattern isn't replicated on the scene scout page.

**Fix:** Add a "Continue to Storyboard →" link/button that appears when all scenes have an approved scout image. Match the pattern used on the cast page.

---

### BUG-6: Storyboard "Generate All" Didn't Complete All Scenes
**Severity:** HIGH
**Phase:** Storyboard (Phase 8)
**What happened:** Clicked "Generate All" for 3 scenes. Scene 1 (7 panels) and Scene 2 (7 panels) completed, but Scene 3 stayed at PENDING with 0 panels. Had to manually expand Scene 3 and click "Generate Panels" separately.

**Likely cause:** The generation loop may have hit a timeout or error on Scene 3 and silently stopped. No error was displayed to the user.

**Fix:** 
1. Add error handling/retry logic when a scene generation fails within the "Generate All" loop
2. Show a clear error message if a scene fails ("Scene 3 generation failed — click to retry")
3. After "Generate All" completes, verify all scenes have panels and report any gaps

---

### BUG-7: Panel Count Display Bug During Generation
**Severity:** MEDIUM
**Phase:** Storyboard
**What happened:** While generation was running, the header showed "3 scenes · 0 panels" even though the DB already had panels. The count wasn't updating in real-time during generation.

**Fix:** The polling/refresh mechanism during generation should update the panel count in the header, not just show the generating spinner.

---

## MEDIUM PRIORITY BUGS

### BUG-8: No Upload Option for Reference/Pose Sheets
**Severity:** MEDIUM
**Phase:** Character Lock (Phase 5)
**What happened:** The Character Lock page only offers "Generate Reference Sheet" — there's no option to upload a custom reference or pose sheet. For a real production, you'd want to upload existing production art rather than rely solely on AI generation.

**Fix:** Add an upload button similar to the cast page's headshot upload, but for pose/reference sheets. Use the same client-side compression + direct Supabase Storage upload pattern.

---

### BUG-9: "Continue to Location Scouting" Link Below the Fold
**Severity:** MEDIUM
**Phase:** Character Lock
**What happened:** The "Continue to Location Scouting" link exists on the Character Lock page, but it's positioned below all the character cards and reference sheets, requiring significant scrolling. Easy to miss.

**Fix:** Add a sticky bottom bar or a secondary "Continue →" button in the page header area when all characters are locked.

---

### BUG-10: Voice-Only Characters Show in Cast Reference Strip
**Severity:** LOW-MEDIUM
**Phase:** Storyboard
**What happened:** The storyboard page shows a "CAST REFERENCE" strip at the top with all characters. Males Voice 1 and Males Voice 2 are shown with placeholder "M" avatars. These are voice-only characters that would never appear in a visual storyboard panel.

**Fix:** Filter out `voice_only: true` characters from the cast reference strip on the storyboard page, or show them in a separate "Voice Cast" section.

---

### BUG-11: No Production Decisions / Style Override System
**Severity:** MEDIUM
**Phase:** All phases
**What happened:** The Production Decisions R2 document contains critical locked decisions that should influence generation:
- **Dream Sequence Style:** Bridgerton — Vibrant/bright/poppy colors (OVERRIDES the original "muted, soft, nostalgic" direction from the script)
- **Background Environment:** Option #5 — SoCal Suburban / Kidney Pool
- **Rob Smirk (Sh.19):** Key comic beat, must land
- **Donna w/o Sweatshirt:** Locked decision

The app has no mechanism to capture, store, or apply these production decisions. AI-generated images follow the raw script extraction without any style overrides. Scene 2 storyboard panels describe "soft-focus and dreamy" visuals rather than the locked Bridgerton vibrant/poppy direction.

**Fix (future feature):** Add a "Production Notes" or "Style Overrides" system where locked decisions can be stored per-project and injected into AI generation prompts. This is more of a feature request than a bug, but it's a significant gap between the pipeline output and real production needs.

---

## LOW PRIORITY / COSMETIC

### BUG-12: Character Description Inconsistency — Rob
**Severity:** LOW
**What happened:** Rob's character description says "Donna's boyfriend" but the script consistently refers to him as her husband ("watching his wife"). The extraction got the relationship wrong.

**Fix:** Update the extraction prompt to be more precise about relationship terms, or allow inline editing of character descriptions (which may already exist in the Film Bible).

---

### BUG-13: No "Completed" / "Export" State for Finished Projects
**Severity:** LOW
**Phase:** Post-storyboard
**What happened:** After all 21 panels are generated and all scenes are BOARDED, the project just sits at `phase_status: "storyboard"`. There's no completion state, no export option, no summary view.

**Fix:** Add a Phase 9 or completion view: project summary, export to PDF storyboard, total panel count, runtime estimate, and a "mark complete" action.

---

## VERIFICATION RESULTS: Storyboard vs. Script Accuracy

### Scene 1 — Donna's Bedroom (Night) — 7 panels
**Accuracy: GOOD** — Panels correctly capture: Donna getting up, removing sweatpants, clearing bed, reaching for princess phone, dialing (rotary detail is a nice touch), listening to menu options, pressing 4 for "Kinky Corner," settling back to listen to Jeff fantasy narration. Dialogue in panel 5 correctly includes the Dial-A-Hunk menu options.

### Scene 2 — Donna's Kitchen / Pool (Day) — 7 panels  
**Accuracy: GOOD with style concern** — Fantasy sequence correctly shows: Jeff skimming pool, removing shirt, Donna at kitchen window with dress strap falling, Jeff walking to back door, screen door detail, kitchen two-shot, passionate kiss. However, visual descriptions use "soft-focus", "dreamy" language that contradicts the LOCKED Bridgerton vibrant/poppy direction.

### Scene 3 — Donna's Bedroom (Night) — 7 panels
**Accuracy: EXCELLENT** — Correctly captures: dimming light, clothes dropping to floor, intercut dream imagery, building to climax, Rob silhouetted in doorway with sly smirk (matches locked "Rob Smirk Sh.19" decision), Rob bellowing "DONNA!", Donna's startled reaction with phone dropping. The comic beat timing is well structured.

### Character Data vs. Script
- **Donna:** Description accurate. Wardrobe progression (sweatpants → summer dress → undressed) correctly tracked across scenes.
- **Jeff:** Description accurate. Fantasy-only nature correctly noted.
- **Rob:** Description mostly accurate. "Boyfriend" should be "husband" (minor). Sly smirk characterization matches Production Decisions.
- **Males Voice 1 & 2:** Correctly flagged as voice_only with appropriate personality descriptions.

---

## ACTIONS FOR CLAUDE CODE (Priority Order)

1. **Delete wrong Ep1 locations + create correct Ep2 locations** — SQL migration to fix locations table, link to scenes
2. **Fix "Generate All" to complete all scenes** — Add retry/error handling for storyboard batch generation
3. **Add cancel button for all AI generation phases** — Abort flag pattern
4. **Add "Continue to Storyboard" nav on scene scout page** — Match cast page pattern
5. **Ensure `project-uploads` bucket is public in schema/migration** — Prevent future breakage
6. **Fix panel count display during generation** — Real-time counter updates
7. **Filter voice-only characters from storyboard cast strip**
8. **Add upload option for reference/pose sheets** — Mirror headshot upload pattern
9. **Fix Rob "boyfriend" → "husband"** — Character description correction
10. **Add sticky "Continue →" button on Character Lock page**

---

## DATA SNAPSHOT (for reference)

| Phase | Status | Details |
|-------|--------|---------|
| 1. Ingestion | COMPLETE | Ep2 script uploaded |
| 2. Extraction | COMPLETE | 3 scenes, 5 characters, 3 locations (WRONG) |
| 3. Film Bible | COMPLETE | Auto-generated |
| 4. AI Casting | COMPLETE | 3 real headshots uploaded (Donna, Jeff, Rob), 2 voice-only |
| 5. Character Lock | COMPLETE | All 3 visual characters locked with reference sheets |
| 6. Locations | BROKEN | 3 wrong Ep1 locations, 15 wrong images, 0 scene linkage |
| 7. Scene Scout | COMPLETE | 9 images generated, 3 approved (1 per scene) |
| 8. Storyboard | COMPLETE | 21 panels (7×3), all with images, 83s runtime |

**Characters:** Donna (lead, locked), Jeff (supporting, locked), Rob (supporting, locked), Males Voice 1 (minor, voice-only), Males Voice 2 (minor, voice-only)

**Project phase_status:** `storyboard`
