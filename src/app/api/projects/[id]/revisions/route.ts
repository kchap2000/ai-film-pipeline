import Anthropic from "@anthropic-ai/sdk";
import { createRouteClient } from "@/lib/supabase-route";
import { validatePlan, planToCursors, type RawFeedbackNote, type RevisionPlan } from "@/lib/revision";
import { recordLesson } from "@/lib/lessons";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * REVISION_VISION R2 — the Revision Engine's front door.
 *
 * POST   { raw_feedback: RawFeedbackNote[], source_assembly_id? }
 *        → creates a revisions row, resolves the notes into a structured
 *          RevisionPlan via Claude (full project context), returns the plan
 *          for the confirm UI. Status: draft → planned.
 * PATCH  { revision_id, action: 'approve' }
 *        → records lessons, seeds a pipeline_runs row (run_type 'revision')
 *          with the plan's cursors, sets status running. The pipeline page
 *          (or any step loop) drives it exactly like a full run.
 * PATCH  { revision_id, action: 'cancel' } → status cancelled.
 * GET    → revision history for the project (newest first).
 */

const RESOLVER_MODEL = "claude-sonnet-4-6";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("revisions")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // Pre-migration DB — degrade to empty history
    return NextResponse.json({ revisions: [], available: false });
  }
  return NextResponse.json({ revisions: data || [], available: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Hub cascade: a swap/recast/element change happened in the workspace
  // and the user clicked "Regenerate affected". The plan is built
  // deterministically (no Claude) from the dependency graph (R5).
  if (body.cascade && typeof body.cascade === "object") {
    const cascade = body.cascade as { source_type: string; source_id: string; reason?: string };
    try {
      const plan = await buildCascadePlan(supabase, id, cascade);
      if (!plan) {
        return NextResponse.json({ error: "No downstream shots found for that change — nothing to regenerate." }, { status: 422 });
      }
      const { data: revision, error: insErr } = await supabase
        .from("revisions")
        .insert({
          project_id: id,
          status: "planned",
          raw_feedback: [{ text: cascade.reason || `${cascade.source_type} updated from the hub`, via: "hub_action" }],
          plan,
        })
        .select("*")
        .single();
      if (insErr) {
        return NextResponse.json({ error: `Could not save revision (run the R1 migration?): ${insErr.message}` }, { status: 500 });
      }
      return NextResponse.json({ revision, plan });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const rawFeedback = (body.raw_feedback || []) as RawFeedbackNote[];
  const sourceAssemblyId = (body.source_assembly_id as string) || null;
  if (!Array.isArray(rawFeedback) || rawFeedback.length === 0) {
    return NextResponse.json({ error: "raw_feedback notes required" }, { status: 400 });
  }

  // Create the draft row first so feedback is never lost even if resolution fails
  const { data: revision, error: insertErr } = await supabase
    .from("revisions")
    .insert({
      project_id: id,
      source_assembly_id: sourceAssemblyId,
      status: "draft",
      raw_feedback: rawFeedback,
    })
    .select("*")
    .single();
  if (insertErr) {
    return NextResponse.json(
      { error: `Could not save feedback (run the R1 migration?): ${insertErr.message}` },
      { status: 500 }
    );
  }

  // ── Resolve notes → plan ────────────────────────────────────
  try {
    const plan = await resolvePlan(supabase, id, rawFeedback);
    if (!plan) {
      await supabase
        .from("revisions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", revision.id);
      return NextResponse.json(
        { error: "Could not resolve the notes into actionable targets — try being more specific about which scene or shot.", revision_id: revision.id },
        { status: 422 }
      );
    }
    const { data: updated } = await supabase
      .from("revisions")
      .update({ status: "planned", plan, updated_at: new Date().toISOString() })
      .eq("id", revision.id)
      .select("*")
      .single();
    return NextResponse.json({ revision: updated, plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("revisions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", revision.id);
    return NextResponse.json({ error: `Plan resolution failed: ${msg}`, revision_id: revision.id }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const revisionId = body.revision_id as string;
  const action = body.action as string;
  if (!revisionId || !action) {
    return NextResponse.json({ error: "revision_id and action required" }, { status: 400 });
  }

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: revision } = await supabase
    .from("revisions")
    .select("*")
    .eq("id", revisionId)
    .eq("project_id", id)
    .single();
  if (!revision) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

  if (action === "cancel") {
    const { data: updated } = await supabase
      .from("revisions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", revisionId)
      .select("*")
      .single();
    return NextResponse.json({ revision: updated });
  }

  if (action === "approve") {
    const plan = revision.plan as RevisionPlan | null;
    if (!plan || !["planned", "draft", "failed"].includes(revision.status)) {
      return NextResponse.json({ error: `Revision is not approvable (status: ${revision.status}, plan: ${plan ? "yes" : "no"})` }, { status: 400 });
    }

    // Human notes become durable lessons (REVISION_VISION A2)
    for (const lessonText of plan.lessons || []) {
      const isGlobal = lessonText.startsWith("GLOBAL:");
      await recordLesson(supabase, {
        scope: isGlobal ? "global" : "project",
        projectId: id,
        category: "director_feedback",
        lesson: isGlobal ? lessonText.slice(7).trim() : lessonText,
        evidence: (revision.raw_feedback as RawFeedbackNote[])
          .map((n) => n.text)
          .join(" | ")
          .slice(0, 400),
      });
    }

    // Supersede any prior active run, then seed the revision run
    await supabase
      .from("pipeline_runs")
      .update({ status: "failed" })
      .eq("project_id", id)
      .eq("status", "running");

    const cursors = planToCursors(plan);
    const { data: run, error: runErr } = await supabase
      .from("pipeline_runs")
      .insert({
        project_id: id,
        mode: "auto",
        run_type: "revision",
        revision_id: revisionId,
        current_step: "revision_edits",
        status: "running",
        progress: {
          revision_id: revisionId,
          revision_edit_index: 0,
          regen_panel_ids: cursors.framePanelIds,
          regen_clip_panel_ids: cursors.clipPanelIds,
          revision_corrections: cursors.corrections,
          revision_motion: cursors.motionOverrides,
        },
      })
      .select("*")
      .single();
    if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

    const { data: updated } = await supabase
      .from("revisions")
      .update({ status: "running", pipeline_run_id: run.id, updated_at: new Date().toISOString() })
      .eq("id", revisionId)
      .select("*")
      .single();

    return NextResponse.json({ revision: updated, run });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ──────────────────────────────────────────────────────────────
// Cascade plan — deterministic dependency walk for hub actions (R5).
// character → every panel the character appears in
// location  → every panel of every scene at that location
// scene     → that scene's panels
// element   → panels of the scenes the element appears in
// ──────────────────────────────────────────────────────────────
async function buildCascadePlan(
  supabase: Awaited<ReturnType<typeof createRouteClient>>["supabase"],
  projectId: string,
  cascade: { source_type: string; source_id: string; reason?: string }
) {
  const { data: panels } = await supabase
    .from("storyboard_panels")
    .select("id, scene_id, panel_number, characters_in_shot")
    .eq("project_id", projectId)
    .order("panel_number");
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, scene_number, location_id")
    .eq("project_id", projectId);
  const allPanels = panels || [];
  const allScenes = scenes || [];

  let panelIds: string[] = [];
  let label = "";

  switch (cascade.source_type) {
    case "character": {
      const { data: ch } = await supabase
        .from("characters")
        .select("name")
        .eq("id", cascade.source_id)
        .single();
      if (!ch) throw new Error("Character not found");
      label = ch.name;
      const nameLc = ch.name.toLowerCase();
      panelIds = allPanels
        .filter((p) => (p.characters_in_shot || []).some((c: string) => c.toLowerCase() === nameLc))
        .map((p) => p.id);
      break;
    }
    case "location": {
      const { data: loc } = await supabase
        .from("locations")
        .select("name")
        .eq("id", cascade.source_id)
        .single();
      if (!loc) throw new Error("Location not found");
      label = loc.name;
      const sceneIds = new Set(allScenes.filter((s) => s.location_id === cascade.source_id).map((s) => s.id));
      panelIds = allPanels.filter((p) => sceneIds.has(p.scene_id)).map((p) => p.id);
      break;
    }
    case "scene": {
      const scene = allScenes.find((s) => s.id === cascade.source_id);
      if (!scene) throw new Error("Scene not found");
      label = `Scene ${scene.scene_number}`;
      panelIds = allPanels.filter((p) => p.scene_id === cascade.source_id).map((p) => p.id);
      break;
    }
    case "element": {
      const { data: el } = await supabase
        .from("project_elements")
        .select("name, scene_numbers")
        .eq("id", cascade.source_id)
        .single();
      if (!el) throw new Error("Element not found");
      label = el.name;
      const sceneIds = new Set(
        allScenes.filter((s) => (el.scene_numbers || []).includes(s.scene_number)).map((s) => s.id)
      );
      // Empty scene_numbers (e.g. environment elements) → all panels
      panelIds = (sceneIds.size > 0 ? allPanels.filter((p) => sceneIds.has(p.scene_id)) : allPanels).map((p) => p.id);
      break;
    }
    default:
      throw new Error(`Unknown cascade source_type: ${cascade.source_type}`);
  }

  if (panelIds.length === 0) return null;

  const correction =
    cascade.reason ||
    `${label} was updated in the workspace — regenerate to match the new approved reference exactly.`;

  return validatePlan({
    targets: [
      {
        action: "reframe_and_reclip",
        panel_ids: panelIds,
        correction,
      },
    ],
    summary: `${label} changed — regenerate the ${panelIds.length} affected shot${panelIds.length === 1 ? "" : "s"} (frames + clips), re-assemble, and build a new film version.`,
    lessons: [],
  });
}

// ──────────────────────────────────────────────────────────────
// Resolver — Claude turns raw notes into a structured RevisionPlan
// ──────────────────────────────────────────────────────────────
async function resolvePlan(
  supabase: Awaited<ReturnType<typeof createRouteClient>>["supabase"],
  projectId: string,
  notes: RawFeedbackNote[]
): Promise<RevisionPlan | null> {
  const [charsRes, locsRes, scenesRes, panelsRes, clipsRes, elementsRes] = await Promise.all([
    supabase.from("characters").select("id, name, role, voice_only, locked, description").eq("project_id", projectId),
    supabase.from("locations").select("id, name, description").eq("project_id", projectId),
    supabase.from("scenes").select("id, scene_number, location, mood, action_summary, characters_present").eq("project_id", projectId).order("scene_number"),
    supabase.from("storyboard_panels").select("id, scene_id, panel_number, shot_type, action_description, characters_in_shot, dialogue").eq("project_id", projectId).order("panel_number"),
    supabase.from("video_clips").select("id, panel_id, status, covered_panel_ids, motion_description").eq("project_id", projectId).in("status", ["approved", "completed", "pending"]),
    supabase.from("project_elements").select("id, kind, name, status, scene_numbers").eq("project_id", projectId),
  ]);

  const scenes = scenesRes.data || [];
  const panels = panelsRes.data || [];
  const clips = clipsRes.data || [];
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const panelByClip = new Map<string, string>();
  for (const c of clips) panelByClip.set(c.id, c.panel_id);

  // Pre-attach context: a note that arrived with a clip_id resolves to its
  // panel (and the sequence panels that clip covers) without inference.
  const annotatedNotes = notes.map((n) => {
    let resolvedPanels: string[] = [];
    if (n.panel_id) resolvedPanels = [n.panel_id];
    else if (n.clip_id) {
      const head = panelByClip.get(n.clip_id);
      if (head) {
        const clip = clips.find((c) => c.id === n.clip_id);
        resolvedPanels = [head, ...((clip?.covered_panel_ids as string[] | null) || [])];
      }
    }
    return { ...n, resolved_panel_ids: resolvedPanels };
  });

  const panelLines = panels
    .map((p) => {
      const scene = sceneById.get(p.scene_id);
      const coveringClip = clips.find(
        (c) => c.panel_id === p.id || ((c.covered_panel_ids as string[] | null) || []).includes(p.id)
      );
      const seqNote =
        coveringClip && ((coveringClip.covered_panel_ids as string[] | null) || []).length > 0
          ? ` [in sequence clip covering ${1 + ((coveringClip.covered_panel_ids as string[] | null) || []).length} shots]`
          : "";
      return `- panel_id=${p.id} Scene ${scene?.scene_number ?? "?"} Panel ${p.panel_number}: ${p.shot_type} — ${p.action_description}${p.dialogue ? ` | "${p.dialogue}"` : ""} | cast: ${(p.characters_in_shot || []).join(", ")}${seqNote}`;
    })
    .join("\n");

  const system = `You are the Revision Planner for an AI film pipeline. A director watched the assembled film and left notes. Resolve each note into structured regen targets.

OUTPUT: a single JSON object, nothing else. Schema:
{
  "targets": [{
    "action": "reframe" | "reclip" | "reframe_and_reclip" | "recast" | "element_fix" | "edit_panel" | "edit_scene" | "edit_character",
    "panel_ids": ["<uuid>", ...],            // ALWAYS resolve to concrete panel ids
    "scene_id": "<uuid>",                     // when the note targets a whole scene
    "character_id": "<uuid>",                 // for recast / edit_character
    "element_id": "<uuid>",                   // for element_fix
    "correction": "<plain production directive distilled from the note — what must change, phrased for an image/video generation prompt>",
    "motion_override": "<only for motion/camera complaints: a full replacement motion prompt>",
    "updates": { "<field>": "<value>" }       // only for edit_* actions
  }],
  "summary": "<1-3 sentences: what you'll regenerate and why>",
  "lessons": ["<durable lesson for future generations; prefix 'GLOBAL: ' if it applies to every project>", ...]
}

DECISION RULES — pick the CHEAPEST sufficient action:
- Motion/animation problem (movement looks fake, camera wrong, action drifts) and the still composition is fine → "reclip" with a correction (and motion_override if the camera/action must change).
- Composition/content/look problem in the image itself (wrong wardrobe, wrong set, fake-looking subject, wrong framing) → "reframe_and_reclip".
- A character's face/identity is fundamentally wrong across many shots → "recast" (panel_ids = every panel that character appears in).
- A recurring prop/creature/outfit element looks wrong → "element_fix" (element_id) PLUS panel_ids of the shots where it appears (those frames+clips regenerate).
- Script/metadata problem (wrong mood, wrong dialogue intent) → edit_* with updates, plus reframe_and_reclip targets if visuals must change.
- A note with pre-resolved panel ids (given below) targets exactly those panels — do not broaden it.
- "The last scene" = the highest scene_number. Notes about pacing/order you cannot fix → leave out of targets and mention in summary.
- corrections must be CONCRETE generation directives (e.g. "the dragon must read as a real animal: weight, bone-structured wings with translucent membrane, atmospheric haze at scale — no rubbery CG sheen"), never just a restatement of the complaint.`;

  const userMsg = `DIRECTOR'S NOTES:
${annotatedNotes
  .map(
    (n, i) =>
      `${i + 1}. "${n.text}" (${n.via}${n.scene_number ? `, watching scene ${n.scene_number}` : ""}${
        n.resolved_panel_ids.length ? `, pre-resolved panel_ids: ${n.resolved_panel_ids.join(", ")}` : ""
      })`
  )
  .join("\n")}

CHARACTERS:
${(charsRes.data || []).map((c) => `- character_id=${c.id} ${c.name} (${c.role}${c.voice_only ? ", voice-only" : ""}${c.locked ? ", locked" : ""}): ${c.description || "-"}`).join("\n")}

LOCATIONS:
${(locsRes.data || []).map((l) => `- location_id=${l.id} ${l.name}: ${l.description || "-"}`).join("\n")}

SCENES:
${scenes.map((s) => `- scene_id=${s.id} Scene ${s.scene_number} @ ${s.location} (mood: ${s.mood}): ${s.action_summary} | cast: ${(s.characters_present || []).join(", ")}`).join("\n")}

ELEMENTS (recurring props/outfits/environments):
${(elementsRes.data || []).map((e) => `- element_id=${e.id} [${e.kind}] ${e.name} (${e.status}, scenes ${(e.scene_numbers || []).join(",") || "?"})`).join("\n")}

STORYBOARD PANELS (the shot list):
${panelLines}

Return the JSON plan.`;

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: RESOLVER_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  return validatePlan(parsed);
}
