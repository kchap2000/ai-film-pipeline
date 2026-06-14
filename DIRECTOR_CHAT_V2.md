# Director's Chat v2 — Conversational Agent Spec

**Status:** Spec for implementation  
**Priority:** High — this is the primary creative interface  
**Scope:** `src/components/DirectorChat.tsx` + `src/app/api/projects/[id]/agent/route.ts`

---

## Problem

The Director's Chat currently operates as a **single-shot executor**: the user gives a note ("the apex soldier outfit does not match the era"), and the agent immediately rewrites the character description, regenerates a headshot, and reports "Done. Here's what changed." There is no conversation. Each message is a cold start with no memory of prior exchanges.

This is wrong for a creative tool. Directors iterate. They want to discuss options, see proposals, refine, *then* execute. The current flow:

```
User: "outfit doesn't match the era"
Agent: (immediately rewrites DB + regenerates) → "Done. Here's what changed..."
```

Should become:

```
User: "outfit doesn't match the era"
Agent: "I see the Soldier's current description says [X]. The issue is the armor reads
        modern/sci-fi — symmetrical panels, flush surfaces. Here's what I'd change:

        BEFORE: 'Dark, layered combat armor with reinforced plating...'
        AFTER:  'Mismatched salvaged armor — riveted chainmail over hammered iron plate,
                 leather straps replacing missing buckles, no symmetrical or machine-made
                 surfaces. Assembled from battlefield necessity, not a matching set.'

        Want me to apply this and generate a new headshot variation?"
User: "yeah but make the chainmail more tarnished, not shiny"
Agent: "Got it — adding oxidized patina and mud-caked links. Updated proposal:

        AFTER: '...riveted chainmail darkened with oxidized patina and ground-in grime,
                hammered iron plate showing dents and field repairs...'

        Applying now."
Agent: (executes update + regen) → "Applied. New variation in slot 3 — check the casting page."
```

---

## Changes Required

### 1. Send Conversation History (Frontend)

**File:** `src/components/DirectorChat.tsx`

**Current:** The `send()` function only sends the latest message:
```typescript
body: JSON.stringify({
  message: msg,
  context: { current_page: currentPage, selected_item_id: selectedItemId },
})
```

**Change:** Send the full conversation history so Claude can see the back-and-forth:
```typescript
body: JSON.stringify({
  messages: [...messages, { role: "user", text: msg }].map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.text,
  })),
  context: { current_page: currentPage, selected_item_id: selectedItemId },
})
```

**Cap history at ~20 messages** to avoid bloating the context. Drop oldest messages first, but always keep the first message (the original direction that started the thread).

### 2. Accept Conversation History (Backend)

**File:** `src/app/api/projects/[id]/agent/route.ts`

**Current:** Constructs a single-message array:
```typescript
const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
```

**Change:** Accept the history from the frontend, validate it, and use it:
```typescript
const history = (body.messages || []) as Array<{ role: string; content: string }>;
const messages: Anthropic.MessageParam[] = history.length > 0
  ? history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
  : [{ role: "user" as const, content: body.message as string }];
```

This gives Claude multi-turn context. It can now reference earlier discussion, remember what was proposed, and build on prior exchanges.

### 3. Rewrite the System Prompt

**Current instruction (line 178–183):**
> "Be decisive and concise. Execute, don't ask for permission on obvious actions."

**Replace with:**

```typescript
const systemPrompt = `You are the Director's Agent for "${project.title}" — a creative collaborator
on an AI film pipeline. You have full project context and tools that update the production database.

## How to respond to direction

1. **Acknowledge what you heard** — restate the note in your own words so the director knows you understood.
2. **Show the current state** — quote the relevant description/setting as it exists now.
3. **Propose specific changes** — show a clear BEFORE → AFTER of what you'd rewrite. Be specific: quote text, not vague summaries.
4. **Ask before executing** — "Want me to apply this?" or "Should I adjust anything first?"
5. **Execute only when approved** — call tools only after the director says yes, approves, or says "just do it" / "go ahead" / "do it" / "yeah" / "apply it".
6. **After executing** — report what changed, what downstream assets are now stale, and suggest next steps.

## When to skip the proposal and execute immediately

Only skip the propose step if the director's message is an explicit, unambiguous command with no room for interpretation:
- "Regenerate panel 7" → just do it
- "Delete the second location variation" → just do it
- "Apply that" / "Do it" / "Go ahead" / "Yeah" (after a proposal) → execute the last proposal

For anything that involves *rewriting creative content* (descriptions, moods, visual direction), always propose first.

## Tone

Be a sharp, opinionated collaborator — not a customer service bot. You know this project. You have taste.
When proposing changes, explain *why* (e.g., "the symmetrical panels read sci-fi, not medieval").
If the director's note is vague, offer two options and recommend one.
Keep responses concise — no walls of text. Short paragraphs, clear structure.

## Project context

PROJECT: ${project.title} (phase: ${project.phase_status}, mode: ${project.mode})
PRODUCTION NOTES: ${project.production_notes || "(none)"}
CURRENT PAGE: ${context.current_page || "unknown"}${context.selected_item_id ? ` · SELECTED: ${context.selected_item_id}` : ""}

CHARACTERS:
${characterBlock}

LOCATIONS:
${locationBlock}

SCENES:
${sceneBlock}

STORYBOARD PANELS:
${panelBlock}`;
```

### 4. Add `propose_changes` Tool (Optional but Recommended)

Add a structured tool that Claude can call to present a formal proposal. This lets the UI render it as a rich diff card instead of plain text.

```typescript
{
  name: "propose_changes",
  description: "Present a proposed change to the director for approval. Do NOT execute yet — just show what would change. The director will approve, reject, or refine.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string", enum: ["character", "location", "scene", "panel", "production_notes"] },
      entity_id: { type: "string" },
      entity_name: { type: "string", description: "Human-readable name for display" },
      field: { type: "string", description: "Which field is changing (e.g. 'description', 'mood', 'camera_movement')" },
      before: { type: "string", description: "Current value (verbatim from DB)" },
      after: { type: "string", description: "Proposed new value" },
      reasoning: { type: "string", description: "Why this change addresses the director's note" },
    },
    required: ["entity_type", "entity_id", "entity_name", "field", "after", "reasoning"],
  },
}
```

**Tool executor** — doesn't write to DB, just returns confirmation:
```typescript
case "propose_changes": {
  // Store the proposal so we can reference it on approval
  return JSON.stringify({
    status: "proposed",
    summary: `Proposed: update ${input.entity_name} ${input.field}`,
    awaiting_approval: true,
  });
}
```

**Frontend rendering** — when the agent message contains a `propose_changes` action, render it as a diff card:

```
┌─────────────────────────────────────────┐
│ 📝 Proposed: Apex-Soldier-Outfit        │
│ Field: description                      │
│                                         │
│ BEFORE:                                 │
│ "Dark, layered combat armor with        │
│  reinforced plating and tactical..."    │
│                                         │
│ AFTER:                                  │
│ "Mismatched salvaged armor — riveted    │
│  chainmail over hammered iron plate..." │
│                                         │
│ WHY: Symmetrical panels read sci-fi,    │
│ not medieval siege warfare              │
│                                         │
│  [✓ Apply]  [✎ Refine]  [✕ Reject]     │
└─────────────────────────────────────────┘
```

- **Apply** → sends "Apply that" as the next message (Claude will execute the update tools)
- **Refine** → focuses the input with a prompt like "I'd change..."
- **Reject** → sends "No, leave it as is" 

### 5. Streaming Response (Nice-to-Have, Not Blocking)

Currently the agent waits for the full tool-use loop to finish before returning. For a conversational feel, switch to streaming so the director sees the proposal forming in real-time.

**Backend:** Use `anthropic.messages.stream()` instead of `.create()`, and return a `ReadableStream` via `new Response(stream)`.

**Frontend:** Use `EventSource` or `fetch` with `ReadableStream` to render tokens as they arrive.

This is a larger change and can be done as a follow-up. The conversation history + prompt rewrite are the critical pieces.

### 6. UI Polish

**Wider drawer.** Currently 380px — bump to 440px or make it resizable. Proposals with before/after diffs need more room.

**Richer message rendering.** Currently all agent messages are plain `whitespace-pre-wrap` text. Add:
- Markdown rendering (bold, bullets) for agent responses
- Proposal cards (see above) for `propose_changes` tool results
- Inline image previews when a regeneration completes (show the new variation thumbnail)

**Conversation starter chips.** Below the intro text, show contextual suggestions based on the current page:
- On Elements/Hub page: "Change [character]'s look", "Update a location mood"
- On Storyboard: "Adjust camera on panel [N]", "Change the action in scene [N]"
- On First Frames: "Regenerate this frame", "The lighting is too flat"

**Clear conversation button.** Add a small "New thread" or trash icon to reset the chat history when starting a new topic.

---

## Implementation Order

1. **System prompt rewrite** (30 min) — biggest behavioral impact, smallest code change
2. **Conversation history** (30 min) — frontend sends array, backend accepts it
3. **`propose_changes` tool + UI card** (2 hrs) — the structured proposal/approval flow
4. **UI polish** (1 hr) — wider drawer, markdown rendering, conversation starters
5. **Streaming** (2 hrs) — nice-to-have follow-up

Steps 1–2 alone transform the experience. Step 3 makes it production-grade.

---

## Files to Change

| File | Change |
|------|--------|
| `src/app/api/projects/[id]/agent/route.ts` | System prompt rewrite, accept history array, add `propose_changes` tool |
| `src/components/DirectorChat.tsx` | Send history, render proposal cards, wider drawer, markdown, clear button |
| `src/lib/types.ts` | Add `ProposedChange` type if using structured proposals |

---

## Testing

After implementing, test these scenarios:

1. **Propose → Approve flow:** "Make Donna's hair darker" → agent proposes → "yeah" → agent executes
2. **Propose → Refine → Approve:** "outfit doesn't match" → agent proposes → "but more tarnished" → refined proposal → "do it"
3. **Direct command (skip proposal):** "Regenerate panel 7" → agent executes immediately
4. **Multi-turn context:** After a change, follow up with "actually make it even more extreme" — agent should remember what was just changed
5. **Ambiguous direction:** "this doesn't look right" — agent should ask which asset, not guess wrong
6. **Page context:** On the Elements page with Soldier selected → "change the outfit" should target Soldier without asking

---

## Non-Goals (for this iteration)

- **Voice input** — future feature, not now
- **Image-aware feedback** — "the colors in this image are wrong" requires vision input; out of scope
- **Undo/revert** — the provenance/versioning system (R1 migration) handles this at the DB level already
- **Multi-user collaboration** — single-director for now
