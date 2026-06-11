import { createRouteClient } from "@/lib/supabase-route";
import { selectBest, castingBrief, locationBrief, sceneScoutBrief } from "@/lib/auto-select";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Auto-Pipeline Orchestrator (FINAL_VISION.md).
 *
 * Resumable step machine over phases 2-12. Each POST {action:"step"}
 * executes ONE unit of work (one variation, one character selection, one
 * scene breakdown, one clip) and persists the cursor in
 * pipeline_runs.progress — so no single invocation approaches the Vercel
 * 300s ceiling and a failed run resumes exactly where it stopped. The
 * pipeline status page drives the loop client-side.
 */

const AUTO_CAST_VARIATIONS = 10;
const QA_PASS_SCORE = 80;
const MAX_QA_LOOPS = 3;

type StepResult = {
  /** human-readable description of the unit of work just done */
  work: string;
  /** step to run next (same step = more units remaining) */
  nextStep: string;
  /** updated progress cursor */
  progress: Record<string, unknown>;
  failed?: string;
};

// GET /api/projects/:id/auto-pipeline — latest run
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("project_id", id)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ run: data || null });
}

// POST /api/projects/:id/auto-pipeline — { action: start | step | pause | resume }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const action = (body.action as string) || "step";
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = req.nextUrl.origin;

  if (action === "start") {
    // Mark any prior running run as failed (superseded)
    await supabase
      .from("pipeline_runs")
      .update({ status: "failed" })
      .eq("project_id", id)
      .eq("status", "running");

    const startStep = (body.start_from_step as string) || "extract";
    const { data: run, error } = await supabase
      .from("pipeline_runs")
      .insert({ project_id: id, mode: "auto", current_step: startStep, status: "running" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("projects").update({ mode: "auto" }).eq("id", id);
    return NextResponse.json({ run });
  }

  // Load the active run
  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("project_id", id)
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (!run) return NextResponse.json({ error: "No active pipeline run — POST {action:'start'} first" }, { status: 400 });

  if (action === "pause") {
    await supabase.from("pipeline_runs").update({ status: "paused" }).eq("id", run.id);
    return NextResponse.json({ run: { ...run, status: "paused" } });
  }
  if (action === "resume") {
    await supabase.from("pipeline_runs").update({ status: "running" }).eq("id", run.id);
    return NextResponse.json({ run: { ...run, status: "running" } });
  }
  if (run.status === "paused") {
    return NextResponse.json({ run, work: "Paused" });
  }

  // Execute one unit of work
  const t0 = Date.now();
  let result: StepResult;
  try {
    result = await executeStep(supabase, id, origin, run.current_step, run.progress || {}, run.qa_loops_completed || 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorLog = [...(run.error_log || []), { step: run.current_step, error: msg, at: new Date().toISOString() }];
    await supabase
      .from("pipeline_runs")
      .update({ status: "failed", error_log: errorLog })
      .eq("id", run.id);
    return NextResponse.json({ error: msg, run: { ...run, status: "failed" } }, { status: 500 });
  }

  const elapsed = (Date.now() - t0) / 1000;
  const timings = { ...(run.phase_timings || {}) };
  timings[run.current_step] = (Number(timings[run.current_step]) || 0) + elapsed;

  const update: Record<string, unknown> = {
    current_step: result.nextStep,
    progress: result.progress,
    phase_timings: timings,
  };
  if (result.failed) {
    // Inner routes can die at the platform level (timeouts return Vercel's
    // {code,id,message} envelope). Those are transient: the generation
    // routes are idempotent (skip-existing), so retry the same step up to
    // 2 times before declaring the run failed. Always store error STRINGS.
    const failedStr = typeof result.failed === "string" ? result.failed : JSON.stringify(result.failed);
    const retries = Number((run.progress || {}).__step_retries) || 0;
    if (retries < 2) {
      const { data: retried } = await supabase
        .from("pipeline_runs")
        .update({
          progress: { ...(run.progress || {}), __step_retries: retries + 1 },
          phase_timings: timings,
        })
        .eq("id", run.id)
        .select("*")
        .single();
      return NextResponse.json({
        run: retried,
        work: `Step ${run.current_step} hit an error (retry ${retries + 1}/2): ${failedStr.slice(0, 200)}`,
      });
    }
    update.status = "failed";
    update.error_log = [...(run.error_log || []), { step: run.current_step, error: failedStr, at: new Date().toISOString() }];
  } else if (result.nextStep === "done") {
    update.status = "completed";
    update.completed_at = new Date().toISOString();
  }
  // Successful unit of work clears the retry counter
  if (!result.failed && (result.progress as Record<string, unknown>).__step_retries !== undefined) {
    delete (result.progress as Record<string, unknown>).__step_retries;
    update.progress = result.progress;
  } else if (!result.failed && Number((run.progress || {}).__step_retries) > 0) {
    // progress object was rebuilt by the step without the counter — fine
    update.progress = result.progress;
  }
  if (result.progress.__qa_loop_increment) {
    update.qa_loops_completed = (run.qa_loops_completed || 0) + 1;
    delete (result.progress as Record<string, unknown>).__qa_loop_increment;
    update.progress = result.progress;
  }

  const { data: updated } = await supabase
    .from("pipeline_runs")
    .update(update)
    .eq("id", run.id)
    .select("*")
    .single();

  return NextResponse.json({ run: updated, work: result.work });
}

// ──────────────────────────────────────────────────────────────
// Step executor — one unit of work per call
// ──────────────────────────────────────────────────────────────
async function executeStep(
  supabase: Awaited<ReturnType<typeof createRouteClient>>["supabase"],
  projectId: string,
  origin: string,
  step: string,
  progress: Record<string, unknown>,
  qaLoops: number
): Promise<StepResult> {
  const api = (path: string, init?: RequestInit) =>
    fetch(`${origin}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });

  switch (step) {
    // ── Phase 2: extraction ──────────────────────────────
    case "extract": {
      const res = await api(`/extract`, { method: "POST", body: JSON.stringify({ project_id: projectId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || "Extraction failed" };
      return { work: `Extracted ${data.characters ?? "?"} characters, ${data.scenes ?? "?"} scenes`, nextStep: "cast_generate", progress: {} };
    }

    // ── Phase 4: casting generation (one variation per call) ──
    case "cast_generate": {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, name, voice_only")
        .eq("project_id", projectId)
        .eq("voice_only", false)
        .order("name");
      const castable = chars || [];
      if (castable.length === 0) return { work: "No castable characters", nextStep: "locations_generate", progress: {} };

      const ci = Number(progress.character_index) || 0;
      const vi = Number(progress.variation) || 1;
      if (ci >= castable.length) return { work: "Casting generation complete", nextStep: "cast_select", progress: {} };

      const char = castable[ci];
      const res = await api(`/projects/${projectId}/cast`, {
        method: "POST",
        body: JSON.stringify({ character_id: char.id, variation_number: vi }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || `Cast gen failed for ${char.name} #${vi}` };

      const nextVi = vi + 1;
      // Preserve cast_backfilled / cast_skip across the generate loop so a
      // cast_select backfill pass can't repeat forever.
      const next =
        nextVi > AUTO_CAST_VARIATIONS
          ? { ...progress, character_index: ci + 1, variation: 1 }
          : { ...progress, character_index: ci, variation: nextVi };
      return {
        work: `${char.name}: variation ${vi}/${AUTO_CAST_VARIATIONS}${data.skipped ? " (existed)" : ""}`,
        nextStep: ci + 1 >= castable.length && nextVi > AUTO_CAST_VARIATIONS ? "cast_select" : "cast_generate",
        progress: next,
      };
    }

    // ── Phase 4b: auto-select best headshot per character ──
    case "cast_select": {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, name, description, approved_cast_id")
        .eq("project_id", projectId)
        .eq("voice_only", false)
        .order("name");
      const castSkip = (progress.cast_skip as string[]) || [];
      const castable = (chars || []).filter((c) => !c.approved_cast_id && !castSkip.includes(c.id));
      if (castable.length === 0) {
        // All selected — lock everyone and move on
        await api(`/projects/${projectId}/lock`, { method: "PATCH", body: JSON.stringify({ lock_all: true }) });
        const skippedNote = castSkip.length > 0 ? ` (${castSkip.length} skipped — no castable images)` : "";
        return { work: `All characters locked${skippedNote}`, nextStep: "pose_sheets", progress: {} };
      }
      const char = castable[0];
      const { data: variations } = await supabase
        .from("cast_variations")
        .select("id, image_url")
        .eq("character_id", char.id)
        .eq("status", "pending");
      if (!variations || variations.length === 0) {
        // A character with no variations (added mid-run, or every image
        // content-blocked) gets ONE backfill pass through cast_generate
        // pointed at its index, then is skipped rather than failing the run.
        const backfilled = (progress.cast_backfilled as Record<string, boolean>) || {};
        if (!backfilled[char.id]) {
          const { data: allCastable } = await supabase
            .from("characters")
            .select("id")
            .eq("project_id", projectId)
            .eq("voice_only", false)
            .order("name");
          const idx = (allCastable || []).findIndex((c) => c.id === char.id);
          return {
            work: `${char.name}: no variations — backfilling casting for this character`,
            nextStep: "cast_generate",
            progress: { character_index: Math.max(0, idx), variation: 1, cast_backfilled: { ...backfilled, [char.id]: true }, cast_skip: castSkip },
          };
        }
        return {
          work: `${char.name}: still no castable images after backfill — skipping`,
          nextStep: "cast_select",
          progress: { ...progress, cast_skip: [...castSkip, char.id] },
        };
      }
      const { winner, all } = await selectBest(castingBrief(char.name, char.description || ""), variations.map((v) => ({ id: v.id, imageUrl: v.image_url })));
      if (!winner) return { work: "", nextStep: step, progress, failed: `Scoring produced no winner for ${char.name}` };
      const res = await api(`/projects/${projectId}/cast`, {
        method: "PATCH",
        body: JSON.stringify({ variation_id: winner.id, status: "approved", character_id: char.id }),
      });
      if (!res.ok) return { work: "", nextStep: step, progress, failed: `Approve failed for ${char.name}` };
      return {
        work: `${char.name}: selected best of ${all.length} (score ${winner.score}/10 — ${winner.reasoning})`,
        nextStep: "cast_select",
        // Keep skip/backfill bookkeeping for the characters still queued
        progress: { cast_backfilled: progress.cast_backfilled, cast_skip: castSkip },
      };
    }

    // ── Phase 5: pose sheets (one character per call) ──────
    case "pose_sheets": {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, name, pose_sheet_url, approved_cast_id")
        .eq("project_id", projectId)
        .eq("voice_only", false)
        .not("approved_cast_id", "is", null);
      const needsSheet = (chars || []).filter((c) => !c.pose_sheet_url);
      if (needsSheet.length === 0) return { work: "Pose sheets complete", nextStep: "locations_generate", progress: {} };
      const char = needsSheet[0];
      const res = await api(`/projects/${projectId}/posesheet`, {
        method: "POST",
        body: JSON.stringify({ character_id: char.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Pose sheet failures shouldn't kill the run (Gemini policy blocks
        // real-person likenesses) — log and continue past this character.
        await supabase.from("characters").update({ pose_sheet_url: null }).eq("id", char.id);
        return {
          work: `${char.name}: pose sheet failed (${data.error || res.status}) — continuing`,
          nextStep: needsSheet.length <= 1 ? "locations_generate" : "pose_sheets",
          progress: { ...progress, [`skip_${char.id}`]: true },
        };
      }
      return { work: `${char.name}: pose sheet generated`, nextStep: "pose_sheets", progress };
    }

    // ── Phase 6: locations (bulk init then one location per call) ──
    case "locations_generate": {
      if (!progress.locations_initialized) {
        // First call creates location rows from scenes (no generation yet
        // happens for locations that already have 5 variations)
        const { data: existing } = await supabase.from("locations").select("id").eq("project_id", projectId);
        if (!existing || existing.length === 0) {
          // Trigger row creation + generation for the FIRST location only is
          // not separable — the route creates rows then generates all. To
          // stay under timeouts we let the route create rows by calling it
          // with a bogus location filter? Simpler: call bulk once for row
          // creation w/ generation; route generates sequentially within 300s.
          const res = await api(`/projects/${projectId}/locations`, { method: "POST", body: JSON.stringify({}) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || "Location generation failed" };
          return { work: `Locations generated (${data.totalGenerated ?? "?"} images)`, nextStep: "locations_select", progress: {} };
        }
        progress = { ...progress, locations_initialized: true };
      }
      // Rows exist: generate missing variations one location per call
      const { data: locations } = await supabase.from("locations").select("id, name").eq("project_id", projectId).order("name");
      const li = Number(progress.location_index) || 0;
      if (!locations || li >= locations.length) return { work: "Location generation complete", nextStep: "locations_select", progress: {} };
      const loc = locations[li];
      const res = await api(`/projects/${projectId}/locations`, { method: "POST", body: JSON.stringify({ location_id: loc.id }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { work: "", nextStep: step, progress, failed: data.error || `Location gen failed for ${loc.name}` };
      }
      return { work: `${loc.name}: variations generated`, nextStep: li + 1 >= locations.length ? "locations_select" : "locations_generate", progress: { ...progress, location_index: li + 1 } };
    }

    // ── Phase 6b: auto-select best location image ─────────
    case "locations_select": {
      const { data: locations } = await supabase
        .from("locations")
        .select("id, name, description, time_of_day, mood, approved_image_url")
        .eq("project_id", projectId)
        .order("name");
      const unapproved = (locations || []).filter((l) => !l.approved_image_url);
      if (unapproved.length === 0) return { work: "All locations approved", nextStep: "scenes_generate", progress: {} };
      const loc = unapproved[0];
      const { data: variations } = await supabase
        .from("location_variations")
        .select("id, image_url")
        .eq("location_id", loc.id)
        .eq("status", "pending");
      if (!variations || variations.length === 0) {
        return { work: "", nextStep: step, progress, failed: `No pending variations for location ${loc.name}` };
      }
      const { winner, all } = await selectBest(locationBrief(loc.name, loc.description || "", loc.time_of_day || "", loc.mood || ""), variations.map((v) => ({ id: v.id, imageUrl: v.image_url })));
      if (!winner) return { work: "", nextStep: step, progress, failed: `No winner for location ${loc.name}` };
      const res = await api(`/projects/${projectId}/locations`, {
        method: "PATCH",
        body: JSON.stringify({ variation_id: winner.id, status: "approved", location_id: loc.id }),
      });
      if (!res.ok) return { work: "", nextStep: step, progress, failed: `Approve failed for location ${loc.name}` };
      return { work: `${loc.name}: best of ${all.length} selected (${winner.score}/10)`, nextStep: "locations_select", progress: {} };
    }

    // ── Phase 7: scene scouts (one scene per call) ─────────
    case "scenes_generate": {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("id, scene_number")
        .eq("project_id", projectId)
        .order("scene_number");
      const si = Number(progress.scene_index) || 0;
      if (!scenes || si >= scenes.length) return { work: "Scene scouts complete", nextStep: "scenes_select", progress: {} };
      const scene = scenes[si];
      const res = await api(`/projects/${projectId}/scenes`, { method: "POST", body: JSON.stringify({ scene_id: scene.id }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { work: "", nextStep: step, progress, failed: data.error || `Scene scout gen failed for scene ${scene.scene_number}` };
      }
      return {
        work: `Scene ${scene.scene_number}: scout images generated`,
        nextStep: si + 1 >= scenes.length ? "scenes_select" : "scenes_generate",
        progress: { ...progress, scene_index: si + 1 },
      };
    }

    // ── Phase 7b: auto-select best scout per scene ─────────
    case "scenes_select": {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("id, scene_number, action_summary, location, mood, characters_present, approved_scout_image_url")
        .eq("project_id", projectId)
        .order("scene_number");
      const unapproved = (scenes || []).filter((s) => !s.approved_scout_image_url);
      if (unapproved.length === 0) return { work: "All scene scouts approved", nextStep: "storyboard", progress: {} };
      const scene = unapproved[0];
      const { data: variations } = await supabase
        .from("scene_variations")
        .select("id, image_url")
        .eq("scene_id", scene.id)
        .eq("status", "pending");
      if (!variations || variations.length === 0) {
        return { work: "", nextStep: step, progress, failed: `No pending scout variations for scene ${scene.scene_number}` };
      }
      const { winner, all } = await selectBest(
        sceneScoutBrief(scene.action_summary || "", scene.location || "", scene.mood || "", scene.characters_present || []),
        variations.map((v) => ({ id: v.id, imageUrl: v.image_url }))
      );
      if (!winner) return { work: "", nextStep: step, progress, failed: `No winner for scene ${scene.scene_number}` };
      const res = await api(`/projects/${projectId}/scenes`, {
        method: "PATCH",
        body: JSON.stringify({ variation_id: winner.id, status: "approved", scene_id: scene.id }),
      });
      if (!res.ok) return { work: "", nextStep: step, progress, failed: `Scout approve failed for scene ${scene.scene_number}` };
      return { work: `Scene ${scene.scene_number}: best of ${all.length} selected (${winner.score}/10)`, nextStep: "scenes_select", progress: {} };
    }

    // ── Phase 8: storyboard (one scene per call) ───────────
    case "storyboard": {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("id, scene_number")
        .eq("project_id", projectId)
        .order("scene_number");
      if (!scenes || scenes.length === 0) return { work: "", nextStep: step, progress, failed: "No scenes" };
      // Find a scene with no panels yet
      const { data: panels } = await supabase.from("storyboard_panels").select("scene_id").eq("project_id", projectId);
      const covered = new Set((panels || []).map((p) => p.scene_id));
      const pending = scenes.filter((s) => !covered.has(s.id));
      if (pending.length === 0) return { work: "Storyboard complete", nextStep: "elements", progress: {} };
      const scene = pending[0];
      const res = await api(`/projects/${projectId}/storyboard`, { method: "POST", body: JSON.stringify({ scene_id: scene.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || `Storyboard failed for scene ${scene.scene_number}` };
      return { work: `Scene ${scene.scene_number}: ${data.panelsGenerated ?? "?"} panels`, nextStep: pending.length <= 1 ? "elements" : "storyboard", progress };
    }

    // ── Phase 9.5: element registry (PROMPTING.md round 3) ──
    // Derive everything that crosses scenes/shots, then generate one
    // reference plate per tick. Higgsfield element creation itself happens
    // through the connector (or REST when configured) — rows progress
    // planned → image_ready here; video generation uses whatever has
    // reached element_ready and degrades gracefully for the rest.
    case "elements": {
      if (!progress.elements_derived) {
        const res = await api(`/projects/${projectId}/elements`, { method: "POST", body: JSON.stringify({ action: "derive" }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || "Element derivation failed" };
        return {
          work: `Element registry: ${data.derived ?? 0} elements planned`,
          nextStep: "elements",
          progress: { ...progress, elements_derived: true },
        };
      }
      const { data: planned } = await supabase
        .from("project_elements")
        .select("id, name, kind")
        .eq("project_id", projectId)
        .eq("status", "planned")
        .in("kind", ["prop", "outfit"])
        .order("created_at")
        .limit(1);
      if (!planned || planned.length === 0) {
        const next = { ...progress };
        delete next.elements_derived;
        delete next.element_image_failures;
        return { work: "Element reference plates complete", nextStep: "first_frames", progress: next };
      }
      const el = planned[0];
      const failures = (progress.element_image_failures as Record<string, number>) || {};
      const res = await api(`/projects/${projectId}/elements`, {
        method: "POST",
        body: JSON.stringify({ action: "generate_image", element_id: el.id }),
      });
      if (!res.ok) {
        // Content-blocked plates shouldn't stall the run: skip after 1 retry
        if ((failures[el.id] || 0) >= 1) {
          await supabase.from("project_elements").update({ status: "skipped" }).eq("id", el.id);
          return { work: `Element ${el.name}: reference image blocked twice — skipped`, nextStep: "elements", progress };
        }
        return {
          work: `Element ${el.name}: reference image failed — retrying once`,
          nextStep: "elements",
          progress: { ...progress, element_image_failures: { ...failures, [el.id]: 1 } },
        };
      }
      return { work: `Element ${el.name}: reference plate generated`, nextStep: "elements", progress };
    }

    // ── Phase 9: first frames (one panel per call, auto-approve) ──
    case "first_frames": {
      const regenTargets = (progress.regen_panel_ids as string[]) || null;
      let panelsQuery = supabase
        .from("storyboard_panels")
        .select("id, panel_number, approved_first_frame_id")
        .eq("project_id", projectId)
        .order("panel_number");
      const { data: panels } = await panelsQuery;
      const targets = (panels || []).filter((p) =>
        regenTargets ? regenTargets.includes(p.id) : !p.approved_first_frame_id
      );
      if (targets.length === 0) {
        const next = { ...progress };
        delete next.regen_panel_ids;
        return { work: "First frames complete", nextStep: "video_clips", progress: next };
      }
      const panel = targets[0];
      const res = await api(`/projects/${projectId}/first-frames`, { method: "POST", body: JSON.stringify({ panel_id: panel.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || `First frame failed for panel ${panel.panel_number}` };

      // Auto-approve the newest frame — but NOT if Gemini returned an SVG
      // placeholder (content block). Retry the panel once; on the second
      // placeholder approve anyway so the pipeline can proceed (the video
      // step will skip the panel after repeated clip failures).
      const { data: frame } = await supabase
        .from("first_frames")
        .select("id, image_url")
        .eq("panel_id", panel.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      const isPlaceholder = !!frame?.image_url?.startsWith("data:image/svg");
      const svgRetries = (progress.frame_svg_retries as Record<string, number>) || {};
      if (frame && isPlaceholder && (svgRetries[panel.id] || 0) < 1) {
        return {
          work: `Panel ${panel.panel_number}: frame came back as placeholder (content blocked) — retrying once`,
          nextStep: "first_frames",
          progress: { ...progress, frame_svg_retries: { ...svgRetries, [panel.id]: 1 } },
        };
      }
      if (frame) {
        await api(`/projects/${projectId}/first-frames`, {
          method: "PATCH",
          body: JSON.stringify({ frame_id: frame.id, status: "approved" }),
        });
      }
      // If this was a regen target, remove it from the list
      let nextProgress = progress;
      if (regenTargets) {
        nextProgress = { ...progress, regen_panel_ids: regenTargets.filter((t) => t !== panel.id) };
      }
      const placeholderNote = isPlaceholder ? " (placeholder — video will be skipped for this shot)" : "";
      return { work: `Panel ${panel.panel_number}: first frame generated + approved${placeholderNote}`, nextStep: "first_frames", progress: nextProgress };
    }

    // ── Phase 10: video clips (one panel per call, auto-approve) ──
    case "video_clips": {
      const regenTargets = (progress.regen_clip_panel_ids as string[]) || null;
      const { data: panels } = await supabase
        .from("storyboard_panels")
        .select("id, panel_number, approved_first_frame_id")
        .eq("project_id", projectId)
        .order("panel_number");
      // ALL clip rows — failed ones count toward an attempt cap so a panel
      // whose clips keep failing (e.g. its frame is an SVG placeholder)
      // gets skipped after 2 attempts instead of looping forever.
      const { data: allClips } = await supabase
        .from("video_clips")
        .select("id, panel_id, status, covered_panel_ids, higgsfield_job_id")
        .eq("project_id", projectId);
      const clips = (allClips || []).filter((c) => ["pending", "completed", "approved"].includes(c.status));
      const failedCount: Record<string, number> = {};
      for (const c of allClips || []) {
        if (c.status === "failed") failedCount[c.panel_id] = (failedCount[c.panel_id] || 0) + 1;
      }
      // A panel counts as covered if it has its own clip OR is folded into
      // a sibling's multi-shot sequence clip.
      const covered = new Set(clips.map((c) => c.panel_id));
      for (const c of clips) {
        for (const cid of (c.covered_panel_ids as string[] | null) || []) covered.add(cid);
      }
      const skippedFailed = (panels || []).filter((p) => !covered.has(p.id) && (failedCount[p.id] || 0) >= 2);
      for (const p of skippedFailed) covered.add(p.id);
      // QA regens: a flagged panel that lives inside a sequence clip maps
      // to that clip's HEAD panel — regenerating the head (with replace)
      // re-rolls the whole sequence so coverage is never lost.
      let effectiveRegen = regenTargets;
      if (regenTargets) {
        const headByPanel: Record<string, string> = {};
        for (const c of clips) {
          for (const cid of (c.covered_panel_ids as string[] | null) || []) headByPanel[cid] = c.panel_id;
        }
        effectiveRegen = Array.from(new Set(regenTargets.map((t) => headByPanel[t] || t)));
      }
      const targets = (panels || []).filter((p) =>
        p.approved_first_frame_id && (effectiveRegen ? effectiveRegen.includes(p.id) : !covered.has(p.id))
      );
      if (targets.length === 0) {
        // All panels have a clip row — but some may be stuck 'pending' with a
        // Higgsfield job id (submit timed out mid-poll). Make up to 3 resume
        // passes (the video-clips POST resume path re-polls the job) before
        // moving on to assembly. Job-LESS pending clips are external
        // fulfillment (CLI runner / MCP) — resume passes can't help those
        // and re-POSTing their panel would mint duplicate clips, so skip.
        const pendingPanels = (clips || [])
          .filter((c) => c.status === "pending" && c.higgsfield_job_id)
          .map((c) => c.panel_id);
        const resumeRounds = Number(progress.video_resume_rounds) || 0;
        if (pendingPanels.length > 0 && resumeRounds < 3) {
          const panelId = pendingPanels[0];
          const panelNum = (panels || []).find((p) => p.id === panelId)?.panel_number ?? "?";
          await api(`/projects/${projectId}/video-clips`, { method: "POST", body: JSON.stringify({ panel_id: panelId }) });
          // Re-check: did it complete?
          const { data: refreshed } = await supabase
            .from("video_clips")
            .select("id, status")
            .eq("panel_id", panelId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          if (refreshed?.status === "completed") {
            await supabase.from("video_clips").update({ status: "approved" }).eq("id", refreshed.id);
            return { work: `Panel ${panelNum}: pending clip resolved + approved`, nextStep: "video_clips", progress };
          }
          return {
            work: `Panel ${panelNum}: still processing (resume pass ${resumeRounds + 1}/3)`,
            nextStep: "video_clips",
            progress: { ...progress, video_resume_rounds: resumeRounds + 1 },
          };
        }
        const next = { ...progress };
        delete next.regen_clip_panel_ids;
        delete next.video_resume_rounds;
        const notes = [
          pendingPanels.length > 0 ? `${pendingPanels.length} pending external fulfillment` : "",
          skippedFailed.length > 0 ? `${skippedFailed.length} skipped after repeated failures` : "",
        ].filter(Boolean).join(", ");
        return { work: `Video clips complete${notes ? ` (${notes})` : ""}`, nextStep: "assemble", progress: next };
      }
      const panel = targets[0];
      const res = await api(`/projects/${projectId}/video-clips`, {
        method: "POST",
        // Regens replace the existing covering clip (the route re-rolls the
        // whole sequence the panel belonged to, keeping coverage intact).
        body: JSON.stringify(effectiveRegen ? { panel_id: panel.id, replace: true } : { panel_id: panel.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || `Clip failed for panel ${panel.panel_number}` };

      // Auto-approve completed clips
      const { data: newClip } = await supabase
        .from("video_clips")
        .select("id, status, covered_panel_ids")
        .eq("panel_id", panel.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (newClip?.status === "completed") {
        await supabase.from("video_clips").update({ status: "approved" }).eq("id", newClip.id);
      }
      let nextProgress = progress;
      if (regenTargets) {
        // The new clip satisfies its head panel AND every panel its
        // sequence covers — clear all of them from the regen list.
        const satisfied = new Set([panel.id, ...(((newClip?.covered_panel_ids as string[] | null) || []))]);
        nextProgress = { ...progress, regen_clip_panel_ids: regenTargets.filter((t) => !satisfied.has(t)) };
      }
      const pendingNote = newClip?.status === "pending" ? " (queued for Higgsfield fulfillment)" : "";
      return { work: `Panel ${panel.panel_number}: clip generated${pendingNote}`, nextStep: "video_clips", progress: nextProgress };
    }

    // ── Phase 11: assembly ─────────────────────────────────
    case "assemble": {
      // force: auto mode assembles whatever exists (clips may still be
      // pending external fulfillment); the coverage warning rides along.
      const res = await api(`/projects/${projectId}/assembly`, { method: "POST", body: JSON.stringify({ force: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // No clips with video (all pending external) — complete the run
        // gracefully; assembly + QA can re-run once clips are fulfilled.
        if ((data.error || "").includes("No completed clips")) {
          return { work: "Assembly skipped — clips awaiting external fulfillment", nextStep: "done", progress };
        }
        return { work: "", nextStep: step, progress, failed: data.error || "Assembly failed" };
      }
      return { work: `Assembled ${data.clip_count} clips (~${Math.round(data.duration_seconds || 0)}s)`, nextStep: "qa", progress };
    }

    // ── Phase 12: QA + auto-regen loop ─────────────────────
    case "qa": {
      const res = await api(`/projects/${projectId}/qa`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { work: "", nextStep: step, progress, failed: data.error || "QA failed" };
      const report = data.report || {};
      const score = Number(report.overall_score) || 0;
      const regenTargets: Array<{ panel_id: string }> = report.regen_targets || [];

      if (score < QA_PASS_SCORE && regenTargets.length > 0 && qaLoops < MAX_QA_LOOPS) {
        const panelIds = regenTargets.map((t) => t.panel_id).filter(Boolean);
        return {
          work: `QA score ${score}/100 — regenerating ${panelIds.length} flagged shots (loop ${qaLoops + 1}/${MAX_QA_LOOPS})`,
          nextStep: "first_frames",
          progress: {
            regen_panel_ids: panelIds,
            regen_clip_panel_ids: panelIds,
            __qa_loop_increment: true,
          },
        };
      }
      return { work: `QA complete — score ${score}/100`, nextStep: "done", progress };
    }

    case "done":
      return { work: "Pipeline complete", nextStep: "done", progress };

    default:
      return { work: "", nextStep: step, progress, failed: `Unknown step: ${step}` };
  }
}
