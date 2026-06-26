# Elements vs Gemini — proven keyframe routing (2026-06-21)

## The decision (tested, not theoretical)
For any shot **with a specific person**, generate the keyframe from a **Higgsfield
Element** (trained identity), NOT one-shot Gemini. Gemini stays for
environment/establishing/insert shots where it already scores 9–10.

Proof: the EP03 "Rocky behind the bar" shot rendered as a garbled **contact-sheet
grid** via Gemini (unusable). The same shot via a Rocky Element came back as a clean,
on-identity, period-correct single frame on the first try. See
`~/Desktop/EP03_ElementTest/` (rocky_GEMINI_FAILED_grid.jpg vs rocky_element_bar_*.png),
then a full 6-shot EP03 set, all on-model.

## The recipe (what worked)
1. **One clean SINGLE headshot per character** (portrait/square crop — NOT a 16:9
   multi-pose contact sheet; the contact sheet is what made Gemini emit grids).
2. `media_upload` → PUT bytes → `media_confirm` → `show_reference_elements
   action=create` (category character/environment/prop). Takes ~1 min/element.
3. Generate the keyframe on **Nano Banana** (`nano_banana_2`) with the element(s)
   embedded as `<<<element_id>>>` in the prompt — one per character + one for the
   location + props. Add the era grade + period negatives. `count: 2` for coverage.
4. **Coverage technique**: ask for 2–4 angles of the one setup, harvest the best.
5. Keep the 3-axis gate (realism/beat/identity) on top of generated frames.
6. **Motion**: feed each approved keyframe's job_id as `start_image` to
   `seedance_2_0` (image-to-video). Identity carries from the still into the clip.
7. **Assemble**: concat the clips (ffmpeg). 4-concurrent job cap on Higgsfield
   ultimate — submit in batches.

## EP03 "Running Late" element library (Lazy Motion Labs workspace) — reuse these
- Khalil-MV  `207a7bd2-9390-4db4-8331-148b633edbcb`  (character)
- Rocky-MV   `03749daa-de40-4115-bc92-ed48e677a717`  (character; render hair "pulled
  back in a loose low ponytail" to match his reference)
- Fletch-MV  `75673877-da34-48f3-9906-05d387bcd7bd`  (character)
- RockAndRollCafe-MV `124392ce-4a85-4451-95da-79bf0f723320` (environment)
- Bathroom-MV `988e76be-9bfb-4bb7-a204-6eacfe67e79e` (environment)
- apartment-MB-interior `8774e28b-7149-4069-a236-de8a2ac8a012` (environment; pre-existing)
- Trooper-MV `30f8d718-7585-4088-9839-e008990ff752` (prop)
- clock-324 `9455c4c6-ecda-40e6-b83b-09c3edab56f8`, nokia-6230 `e835581e-...` (props)

## Pipeline wiring (next code step)
Make the **keyframe step model-routed** like video already is:
- shot has a locked character → Higgsfield Element path (this recipe), via the
  connector/CLI (the keyframe step becomes a connector step like clip fulfillment —
  prod Vercel has no Higgsfield creds, so it runs through the local connector).
- else → Gemini (unchanged).
Add **"create element from headshot"** to `scripts/intake.mjs`: for every provided
character, auto-create its Element so identity is locked from frame one. This is the
highest-value intake gap-fill (ASSET_INTAKE_PLAN open question #3).

## Known reference-quality rule
Single tight headshot crops make good elements; multi-pose sheets degrade them.
Intake should auto-crop a single face when only a sheet is provided.
