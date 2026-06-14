# Realism & Consistency Notes — for the next agent session

> Khalil's review notes from watching a production, organized for action.
> **North star: every production scores a 10/10 — on realism, character
> consistency, AND beat/world-rule fidelity — with zero manual babysitting.**
> Read alongside PROGRESS.md (two-axis frame gate, realism gate, lessons system
> are already built — extend them, don't rebuild).

---

## 1. First-frame realism is the #1 problem

**Symptom:** first frames aren't hitting the realism bar. The film looks
AI/illustrated instead of photoreal, and that style carries into every video clip.

**Suspected root cause:** the storyboard images are stylized "panel art," NOT
photoreal — and that stylization is bleeding into the first frames (either the
first frame inherits the storyboard panel as a reference, or the two share a
prompt path that isn't fully photoreal).

**What to do:**
- **Make the storyboard use the SAME prompting, character references, and element
  references that the realistic image pipeline uses.** The storyboard panels
  should be generated as photoreal images (identity-locked headshots + locked
  element refs + the photoreal prompt language from the first-frame path), not as
  a separate stylized "panel art" pass.
- If a storyboard panel is ever used as input to the first frame, confirm it's
  the photoreal version — never a stylized one.
- Audit the first-frame generation prompt: confirm it's using the full photoreal
  stack (ARRI/anamorphic/material-texture/anti-illustration negatives) on EVERY
  frame, not just on gate re-rolls.
- The realism gate already scores frames 1–10 and re-rolls below threshold. If
  frames are still shipping un-photoreal, the **pass threshold is too low** or the
  gate isn't running on every frame — raise the bar (target ≥9) and make it
  mandatory, not best-effort.

---

## 2. Character consistency inside the first frames

**Symptom:** in some first frames the character doesn't match their locked
look (face/identity drift). This then throws off the video generator, because
the clip inherits an already-wrong character.

**What to do:**
- Every first frame must be anchored to the character's locked headshot/element
  reference — verify the identity ref is actually being passed into the
  generation for every shot that character appears in.
- Add an **identity-consistency check** to the frame gate: compare the generated
  face against the locked headshot; if it drifts, re-roll. (Today the gate scores
  realism + beat; add a third axis = identity match.)

---

## 3. World-rule / era / wardrobe violations are slipping through

**Symptom — specific misses observed:**
- **Rayne** ("Rain"): pose sheet does NOT match the headshot (identity drift in
  the reference sheet itself).
- **Ash:** wearing normal modern/day-attire while the rest of the film is set in
  a different era/style.
- **Corin:** wearing a suit (wrong era/style).
- **Crauch soldiers collective** ("Crouch to soldiers"): a mix of modern
  army-people blended in with the intended look — faction wasn't visually consistent.

> ⚠️ Verify exact character names/spellings against the project's character list —
> these are transcribed from voice.

**Why it matters:** these are exactly the kind of details that should be caught
automatically. A locked headshot or pose sheet that violates the world rules
becomes the identity anchor for the whole film, so the error propagates everywhere.

**What to do:**
- The `setting_profile` (era, tech level, wardrobe rules, forbidden anachronisms)
  and per-character wardrobe already exist. The **anachronism gate is missing
  these characters** — figure out why (is the setting profile not being injected
  into casting/pose-sheet prompts? is the gate threshold letting them through?).
- Add a **hard safeguard at the reference gate**: a character's headshot AND pose
  sheet must pass the anachronism/world-rule check before they can be locked. If
  Ash shows up in modern clothes, it should auto-reject and re-cast under the
  world rules — not lock and propagate.
- Per-character wardrobe rules should be explicit in the prompt (e.g. "Ash wears
  [era-appropriate garment]; NEVER modern clothing") and enforced by the gate.
- For factions/collectives (the Crauch soldiers), there needs to be a faction-level
  consistency rule so a group reads as ONE coherent look, not a mix.

---

## 4. Click-to-expand on all images (UI)

**Symptom:** in the Film Bible, the Workspace, elements, etc., you can't click an
image to see it bigger. There's no way to inspect a character/element/frame closely.

**What to do:**
- Add a click-to-expand / lightbox on every image across the app — Film Bible,
  Workspace (Cast/Locations/Scenes/Elements), storyboard, first frames. Click →
  full-size modal view.

---

## 5. Research the best model + reference approach for consistency + realism

**Goal:** determine the best current solution for (a) photoreal first frames and
(b) character/element consistency, comparing:
- Latest **Gemini** image model (Nano Banana Pro / gemini-3-pro-image) — current path.
- Latest **OpenAI/GPT** image model.
- Best practice for feeding **multiple character + element references** into a
  single generation (how many refs, how to weight identity vs. environment, etc.).

Pick the approach that maximizes consistency + realism and document why. This
should be a real comparison, not a guess.

---

## 6. Strengthen the learning loop

**Goal:** the system should always be getting better — track which prompts/approaches
produce high realism + consistency scores and which don't, and feed that back in.

**What to do:**
- The `pipeline_lessons` system already records corrections. Extend it to log
  **what worked** (prompt patterns that scored 9–10), not just failures, and
  surface the winning patterns into future prompts.
- Tie this to the gates: every re-roll is a data point about what fixed (or didn't
  fix) realism/identity/era — capture it.

---

## Priority order (suggested)
1. **First-frame realism** — unify storyboard → photoreal pipeline, raise gate bar (#1).
2. **Anachronism/era safeguards at the reference gate** — stop bad locks propagating (#3).
3. **Identity-consistency axis on the frame gate** (#2) + pose-sheet↔headshot match.
4. **Model/reference research** to lock in the best approach (#5).
5. **Learning loop: capture what works** (#6).
6. **Click-to-expand UI** (#4) — high value, low effort, can land anytime.

## Open questions to confirm before building
- Confirm exact character names/spellings (Rayne? Corin/Caster? Crauch?).
- Is the storyboard currently a stylized pass, or already photoreal? (Determines
  whether #1 is a prompt change or a pipeline merge.)
- Target gate threshold for "ship it" — proposing realism ≥9, identity match
  required, zero anachronism flags.
