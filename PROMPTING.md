# PROMPTING.md — Cinematic AI Video Prompt Knowledge Base

> Source of truth for how this pipeline writes generation prompts.
> Harvested from Khalil's Supercreator projects (the fantasy siege sequence,
> the Costa Rica travel film) + Higgsfield's official Seedance guide +
> community prompt-engineering research. `src/lib/prompt-engine.ts` encodes
> these rules; the Director's Agent and future sessions should read this
> file before changing prompt behavior.

---

## The House Prompt Structure (per shot)

Every video prompt is built in this order — the model weights earlier
content more heavily, so identity and constraints come first:

```
[TECHNICAL PREAMBLE]   camera body, lens, film stock, grade, negatives
VISUALS:               shot framing + ONE action beat + camera move + set
DIALOGUE / SPOKEN AUDIO:  speaker-attributed quoted lines, or "No dialogue in this shot."
SOUND EFFECTS / FOLEY: descriptive SFX list (or NO MUSIC / NO SFX)
ELEMENTS / REFERENCES: <<<element_id>>> roles (who/what each ref locks)
CONTINUITY RULES:      what must NOT change (wardrobe, set, color rules)
```

This is the structure from Khalil's strongest manual prompts (the dragon
chain-bind shot) and it consistently outperforms a single prose blob.

## Technical Preamble (style anchor)

Real-world cinematography references are the highest-leverage style
control. House defaults, adjusted per project mood:

- Camera/lens: `ARRI Alexa 35, anamorphic prime lenses, shallow depth of field`
- Stock/grade: `Kodak Portra 400 warm grade` (memory/romance) ·
  `desaturated high-contrast` (drama) · `soft halation, subtle film grain`
- Negative constraints go HERE, positively phrased and early:
  `No subtitles, no text overlay, no captions, no watermarks, no logos, no UI elements.`
  `No waxy CGI, no video-game render, no cartoon shading.`
- Stability suffix (community-validated verbatim):
  `Avoid jitter. Face stable, no deformation. Natural smooth movements. Stable picture.`

## Multi-Shot Sequences (Seedance 2.0, up to 15s)

Two interchangeable syntaxes; the engine uses numbered shots:

```
Shot 1: Wide — Donna sits on the bed, lamp light warm. Static.
Shot 2: Close-up — her finger presses '4' on the keypad. Insert.
Shot 3: Medium — she sinks into the pillows, smiling. Slow dolly-in.
Total: 12s / 3 shots / 16:9
```

Rules:
- **One action verb per shot/beat.** Multiple actions blend into mush.
- Each beat 2–3 sentences, 50–75 words max; whole prompt sweet spot 60–100
  words (excluding the structured DIALOGUE/SFX blocks).
- Declare shot count + total duration + aspect ratio in a metadata footer.
- Escalation arc across shots: calm → turn → peak → settle.
- Transitions are written, not implied: `Cut to:`, `Slow push in begins`,
  `RAMPS TO SLOW MOTION … SNAPS BACK`.

## Camera Vocabulary (use these exact terms)

wide / medium / close-up / extreme close-up / insert / OTS / POV ·
low-angle, high-angle, dutch · static (locked-off), pan-left/right,
tilt, dolly-in/out, crane, handheld, steadicam, orbit / 360-degree ·
`single continuous shot, no cuts, no zoom, natural head movement` (POV —
without this Seedance cuts between angles on its own).

## Dialogue & Speech

Speaker-attributed quoted lines render as spoken audio with lip sync:

```
DIALOGUE / SPOKEN AUDIO:
DONNA (breathless, panicked): "Oh God— ROB!"
ROB (booming, from the doorway): "Donna! What the HELL is going on in here?!"
JEFF (V.O., reflective, low): "Every day I came back."
```

- `(V.O., tone)` for narration — voice plays without on-screen lips.
- Tone direction in the parenthetical changes the read.
- A shot with no lines still gets the section: `No dialogue in this shot.`
- Lip-sync to an uploaded track: `Lip-sync to @audio1`.

## Sound Design

A short SFX list at the end of the prompt materially improves audio:

```
SOUND EFFECTS / FOLEY: pool water lapping, distant cicadas, screen door
spring-slap, receiver clattering on hardwood.
```

Or explicitly: `NO MUSIC. No score.` Sound keywords map to real foley:
reverb/echoing (room tone), fabric rustle, crackling fire, rain on window,
`all sound cuts` (hard silence).

## Elements & References (consistency backbone)

- `<<<element_id>>>` placeholders in the prompt body — Higgsfield injects
  the locked reference image and rewrites to `@element_name`. Multiple per
  prompt. Supported by Seedance 2.0, Kling 3.0, Nano Banana Pro, et al.
- **Everything that crosses scenes is an element**: characters (headshot +
  pose sheet + the outfit they wear), recurring props (the princess phone),
  outfits as standalone elements when wardrobe must survive re-staging,
  environments (the ONE canonical bedroom).
- Give each element a job in the ELEMENTS section, like Khalil's originals:
  `Use the headshot for closeups; use the pose sheet for body/wardrobe continuity.`
  `Dragon breath is dark red, never gold.` ← rules ride on the element.
- Identity drift killers: use the SAME noun for a character in every beat
  (never alternate "a man / the detective / him"), and add
  `Avoid identity drift. Consistent appearance across all beats.`

## Continuity Rules Section

State what must not change — models respect explicit invariants far better
than implied ones:

```
CONTINUITY RULES: Same outfit first frame to last frame, no wardrobe
changes. Same bedroom set as the reference — walls, lamps, bedding
identical. The phone is the pastel-pink princess phone in every shot.
```

## Reference Media Roles (Seedance multimodal)

Up to 9 images / 3 videos (≤15s) / 3 audio clips per generation:
- `start_image` — composition + first-frame anchor (our approved frame)
- `@image1 as the character reference` — identity
- `Match the mood and color palette of @image3` — grade transfer
- `Replicate the camera movement from @video1` — motion transfer
- `@audio1 as voice style reference` / beat reference for cuts

## Anti-Patterns (observed failures in our E2E run)

- ❌ Prose-blob prompts with no sections → wardrobe/set drift (Jeff's
  shirt, the two bedrooms).
- ❌ Identity by start_image alone → faces re-imagined per clip; also
  trips IP-detection more often than element-anchored generations.
- ❌ Dialogue omitted → silent film (the data was in the DB all along).
- ❌ Over-stuffed beats ("gathers clothes AND smooths sheets AND settles
  AND smiles") → blended motion. One verb per beat.
- ❌ >200 words of unstructured description → model ignores the tail.

## Sources

- Khalil's Supercreator prompt archive (fantasy siege, Costa Rica film) —
  structure, element roles, continuity-rule pattern, V.O. syntax.
- Higgsfield official: [Seedance Complete Prompting Guide](https://higgsfield.ai/blog/seedance-prompting-guide) — multi-shot
  syntax, metadata footer, POV constraints, VFX brackets, SFX lists.
- Community: [Sirio Berati's prompt engineering guide](https://seedance-prompt-guide.sirioberati.com/) — timeline beats,
  @tag system, quality/stability suffixes, identity-drift rules;
  [seedance.tv](https://www.seedance.tv/blog/seedance-2-0-prompt-guide) and [ChatCut formulas](https://chatcut.io/blog/seedance-2-prompt-guide) — word-count windows, front-loading,
  real-world style anchors.
