# Bug Report — Pipeline Page Navigation + Casting Sameness

**Date:** June 15, 2026  
**Reporter:** Khalil (via Cowork)  
**Reproduce on:** `https://ai-film-pipeline-git-main-khalil-chapmans-projects.vercel.app/projects/ad2907c2-3b36-4cea-bd4a-b8ef089a1671/pipeline`  
**Severity:** High (both bugs)

---

## Bug 1: "← Back to Project" link does not navigate during active auto run

### Symptom

On the Auto Pipeline page (`/projects/:id/pipeline`), clicking the "← BACK TO PROJECT" link does nothing while the pipeline is running. The URL stays on `/pipeline`. The page appears frozen in place. Confirmed by clicking the Link element directly via DOM ref — navigation simply doesn't fire.

### Root Cause

**File:** `src/app/projects/[id]/pipeline/page.tsx`, lines 44–76

The `stepLoop()` function runs a tight `while (loopRef.current)` loop that:
1. POSTs to `/api/projects/${id}/auto-pipeline` with `{action: "step"}`
2. Calls `setRun(data.run)` on every iteration
3. Calls `setWorkLog(prev => [...prev.slice(-49), workMsg])` on every iteration
4. Immediately starts the next fetch

Each `setRun`/`setWorkLog` call triggers a React re-render. When a long-running step (like First Frames at 1600+ seconds) returns, the loop fires the next POST immediately. During fast steps (e.g., Element Registry at 6s), the loop fires multiple rapid state updates per second.

**Why navigation breaks:** Next.js App Router client-side navigation is a React transition. When `setRun()` fires during a pending transition, React cancels the transition to process the higher-priority state update. The `while` loop effectively blocks all navigation by continuously canceling any pending route change.

The cleanup function at line 39–41 (`loopRef.current = false`) only runs on unmount, but unmount never happens because the navigation never completes — a deadlock.

### Fix

**Option A (minimal):** Add an `onClick` handler to the Link that sets `loopRef.current = false` before navigation starts:

```tsx
<Link
  href={`/projects/${id}`}
  onClick={() => { loopRef.current = false; }}
  className="text-[10px] uppercase tracking-[0.25em]"
  style={{ color: "var(--brand-orange)" }}
>
  &larr; Back to Project
</Link>
```

This kills the while loop before React tries to transition, so no more state updates will cancel the navigation.

**Option B (belt + suspenders):** Also add a small delay (`await new Promise(r => setTimeout(r, 500))`) at the bottom of the while loop so state updates never fire faster than 2/second, preventing the re-render storm entirely:

```tsx
while (loopRef.current) {
  const res = await fetch(/* ... */);
  // ... handle response ...
  if (!data.run || ["completed", "failed", "paused"].includes(data.run.status)) break;
  await new Promise(r => setTimeout(r, 500)); // ← breathe between iterations
}
```

**Option C (also do):** The Link's click target is `text-[10px]` with no padding — about 12px tall. Even without the loop bug, it's easy to miss. Add `inline-block py-2` for a larger touch target.

---

## Bug 2: Casting variations all look like the same person

### Symptom

On the AI Casting page, all 10 headshot variations for each character look like the same actor photographed from slightly different angles. The purpose of casting is to show DIFFERENT actors who could play the role — different faces, builds, hairstyles — all matching the character description but offering the director a real choice.

Confirmed on project `ad2907c2`: Khalil's 10 variations are the same man from 10 angles. Nicole's 10 variations are the same woman from 10 angles.

### Root Cause

**File:** `src/lib/generate-image.ts`, lines 314–347 (`buildCastingPrompt`)

Two problems:

**Problem A — The prompt explicitly says "same person":**

```typescript
`This is variation ${variation} of 10 — distinctly different angle/expression/lighting
from other variations, but the SAME person, same wardrobe, same era.`
```

Line 345 literally tells Gemini to generate the SAME person every time. The only variation axis is the camera angle (line 332), which gives us 10 photos of one actor instead of 10 different casting options.

**Problem B — The description is empty:**

Both Khalil and Nicole have: "No physical description provided in script — awaiting production notes." When the description is this vague, Gemini has nothing to differentiate against. It settles on one interpretation and repeats it.

### Fix

**Rewrite `buildCastingPrompt` to generate different people, not the same person from different angles.**

The key change: each variation should be a DIFFERENT actor/interpretation that matches the character description, not the same face from a different angle. Think of it like a real casting call — 10 different people walk in, they all fit the character description, but they bring something different.

```typescript
function buildCastingPrompt(
  name: string,
  description: string,
  variation: number
): string {
  // Each variation gets a different "casting direction" to force diversity
  const castingDirections = [
    "classically handsome/beautiful, strong jawline, commanding presence",
    "softer features, approachable, warm energy, everyman/everywoman quality",
    "angular features, intense eyes, sharp bone structure, editorial look",
    "round face, gentle expression, youthful energy, easy smile",
    "weathered and lived-in, character actor, interesting rather than pretty",
    "athletic build, confident posture, strong shoulders",
    "lean and wiry, restless energy, expressive hands",
    "full-figured, grounded, earthy presence",
    "striking contrast — light eyes with dark features or vice versa",
    "unconventionally attractive, distinctive nose or brows, memorable face",
  ];

  const angles = [
    "looking directly at the camera",
    "slight three-quarter turn to the left",
    "slight three-quarter turn to the right",
    "looking slightly upward",
    "looking slightly downward with chin tilted",
    "profile view facing left",
    "profile view facing right",
    "looking over their shoulder",
    "candid expression, mid-thought",
    "intense direct gaze at camera",
  ];

  const angle = angles[(variation - 1) % angles.length];
  const castingDirection = castingDirections[(variation - 1) % castingDirections.length];

  return [
    `A professional casting headshot — a real photograph of a real person, captured on a cinema camera with an 85mm portrait lens, shallow depth of field, clean neutral studio background.`,
    `Character: ${name}.`,
    `Physical description: ${description}.`,
    `CASTING DIRECTION for this actor: ${castingDirection}.`,
    `Pose: ${angle}.`,
    `WARDROBE & ERA ARE MANDATORY: dress and groom this person strictly per the era and wardrobe rules in the description above.`,
    PHOTOREAL_STILL_BLOCK,
    `This is casting variation ${variation} of 10 — a DIFFERENT actor auditioning for the role. Same character, same wardrobe, same era, but a DIFFERENT person with different facial features, different build, different energy. Each variation should look like a distinct human being who could play this part.`,
  ].join(" ");
}
```

**Key changes:**
1. Removed "the SAME person" — replaced with "a DIFFERENT actor auditioning for the role"
2. Added `castingDirections[]` array that gives each variation a different physical archetype
3. Final line explicitly says "DIFFERENT person with different facial features, different build, different energy"

---

## Files to Change

| File | Bug | Change |
|------|-----|--------|
| `src/app/projects/[id]/pipeline/page.tsx` line 166 | Bug 1 | Add `onClick={() => { loopRef.current = false; }}` to Link |
| `src/app/projects/[id]/pipeline/page.tsx` line 70 | Bug 1 | Add 500ms delay at end of while loop |
| `src/app/projects/[id]/pipeline/page.tsx` line 166 | Bug 1 | Add `inline-block py-2` for larger click target |
| `src/lib/generate-image.ts` lines 314–347 | Bug 2 | Rewrite `buildCastingPrompt` per spec above |

---

## Testing

### Bug 1
1. Start or observe an active auto pipeline run
2. Click "← BACK TO PROJECT" while the run is active
3. **Expected:** navigates to `/projects/:id` immediately
4. **Before fix:** URL stays on `/pipeline`, page doesn't change

### Bug 2
1. Create a new project and run casting with 10 variations
2. **Expected:** 10 visibly different actors/interpretations for each character
3. **Before fix:** 10 photos of the same person from different angles
