import { createRouteClient } from "@/lib/supabase-route";
import { bumpVersion } from "@/lib/provenance";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Director Agent (FINAL_VISION.md — Agent Revision System).
 *
 * NOT a chatbot — a co-director with full project context and a tool belt
 * mapped onto the existing API routes. The user gives natural-language
 * direction ("make Donna's hair darker and curlier", "push in instead of
 * panning"); the agent updates the right record, bumps its version (which
 * flags downstream assets stale via provenance), and optionally kicks off
 * regeneration.
 */

const AGENT_MODEL = "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 8;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_character",
    description: "Update a character's physical description and/or personality. Bumps version so downstream assets (headshots, pose sheets, panels) are flagged stale.",
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        description: { type: "string", description: "New full physical description (rewrite, not a diff)" },
        personality: { type: "string" },
      },
      required: ["character_id"],
    },
  },
  {
    name: "update_location",
    description: "Update a location's description, mood, or time of day. Bumps version → downstream scouts/panels flagged stale.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        description: { type: "string" },
        mood: { type: "string" },
        time_of_day: { type: "string" },
      },
      required: ["location_id"],
    },
  },
  {
    name: "update_scene",
    description: "Update a scene's action summary, mood, time of day, or location name.",
    input_schema: {
      type: "object",
      properties: {
        scene_id: { type: "string" },
        action_summary: { type: "string" },
        mood: { type: "string" },
        time_of_day: { type: "string" },
        location: { type: "string" },
      },
      required: ["scene_id"],
    },
  },
  {
    name: "update_panel",
    description: "Update a storyboard panel's action description or camera work. Source of truth for both panel art and first-frame/video regeneration.",
    input_schema: {
      type: "object",
      properties: {
        panel_id: { type: "string" },
        action_description: { type: "string" },
        shot_type: { type: "string" },
        camera_angle: { type: "string" },
        camera_movement: { type: "string" },
      },
      required: ["panel_id"],
    },
  },
  {
    name: "update_production_notes",
    description: "Replace the project-wide production directive (style/continuity rules injected into every image + video prompt). Pass the FULL new text.",
    input_schema: {
      type: "object",
      properties: { notes: { type: "string" } },
      required: ["notes"],
    },
  },
  {
    name: "regenerate_cast_variation",
    description: "Generate one new casting headshot variation for a character (uses the character's current description — update it first if the look should change).",
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        variation_number: { type: "number", description: "1-10; pick an unused slot if possible" },
      },
      required: ["character_id"],
    },
  },
  {
    name: "regenerate_location_variations",
    description: "Generate missing location scout variations for a location (after updating its description, delete-and-regen happens via new slots).",
    input_schema: {
      type: "object",
      properties: { location_id: { type: "string" } },
      required: ["location_id"],
    },
  },
  {
    name: "regenerate_scene_scouts",
    description: "Generate missing scene scout variations for a scene.",
    input_schema: {
      type: "object",
      properties: { scene_id: { type: "string" } },
      required: ["scene_id"],
    },
  },
  {
    name: "regenerate_first_frame",
    description: "Generate a new first frame for a storyboard panel (uses current panel description + identity refs).",
    input_schema: {
      type: "object",
      properties: { panel_id: { type: "string" } },
      required: ["panel_id"],
    },
  },
  {
    name: "regenerate_video_clip",
    description: "Generate a new video clip for a panel, optionally with a custom motion prompt (e.g. 'slow push-in instead of pan').",
    input_schema: {
      type: "object",
      properties: {
        panel_id: { type: "string" },
        motion_prompt: { type: "string" },
      },
      required: ["panel_id"],
    },
  },
];

interface ActionTaken {
  type: string;
  target: string;
  result: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const message = body.message as string;
  const context = (body.context || {}) as { current_page?: string; selected_item_id?: string };
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = req.nextUrl.origin;
  const api = (path: string, init?: RequestInit) =>
    fetch(`${origin}/api${path}`, { ...init, headers: { "Content-Type": "application/json" } });

  // ── Assemble full project context ──────────────────────────
  const [projectRes, charsRes, locsRes, scenesRes, panelsRes] = await Promise.all([
    supabase.from("projects").select("id, title, phase_status, production_notes, mode").eq("id", id).single(),
    supabase.from("characters").select("id, name, description, personality, role, voice_only, locked, approved_cast_id").eq("project_id", id),
    supabase.from("locations").select("id, name, description, time_of_day, mood, approved_image_url").eq("project_id", id),
    supabase.from("scenes").select("id, scene_number, location, time_of_day, mood, action_summary, characters_present, approved_scout_image_url").eq("project_id", id).order("scene_number"),
    supabase.from("storyboard_panels").select("id, scene_id, panel_number, shot_type, camera_angle, camera_movement, action_description, characters_in_shot").eq("project_id", id).order("panel_number"),
  ]);

  if (!projectRes.data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const project = projectRes.data;

  const systemPrompt = `You are the Director's Agent for an AI film production pipeline — a co-director, not a chatbot. You have full project context below and tools that map to the pipeline's API. When the director gives you direction:
1. Identify WHAT asset they mean (character / location / scene / panel / project-wide style).
2. Update the underlying record first (descriptions are the source of truth for all regeneration).
3. Then regenerate if they want to see the result now.
4. Tell them which downstream assets are now stale (changing a character → headshots, pose sheets, panels, first frames, clips that used them).
Be decisive and concise. Execute, don't ask for permission on obvious actions. If direction is ambiguous between two assets, pick the one matching the current page / selected item.

PROJECT: ${project.title} (phase: ${project.phase_status}, mode: ${project.mode})
PRODUCTION NOTES (locked style directive): ${project.production_notes || "(none)"}
CURRENT PAGE: ${context.current_page || "unknown"}${context.selected_item_id ? ` · SELECTED ITEM: ${context.selected_item_id}` : ""}

CHARACTERS:
${(charsRes.data || []).map((c) => `- ${c.name} [${c.id}] role=${c.role}${c.voice_only ? " VOICE-ONLY" : ""}${c.locked ? " LOCKED" : ""}${c.approved_cast_id ? " cast-approved" : ""}: ${c.description || "(no description)"} | personality: ${c.personality || "-"}`).join("\n")}

LOCATIONS:
${(locsRes.data || []).map((l) => `- ${l.name} [${l.id}]${l.approved_image_url ? " approved" : ""}: ${l.description || "-"} (${l.time_of_day || "?"}, mood: ${l.mood || "?"})`).join("\n")}

SCENES:
${(scenesRes.data || []).map((s) => `- Scene ${s.scene_number} [${s.id}] @ ${s.location} (${s.time_of_day}, mood: ${s.mood})${s.approved_scout_image_url ? " scouted" : ""}: ${s.action_summary} | cast: ${(s.characters_present || []).join(", ")}`).join("\n")}

STORYBOARD PANELS:
${(panelsRes.data || []).map((p) => `- Panel ${p.panel_number} [${p.id}] scene_id=${p.scene_id}: ${p.shot_type}/${p.camera_angle}/${p.camera_movement} — ${p.action_description}`).join("\n")}`;

  const anthropic = new Anthropic();
  const actionsTaken: ActionTaken[] = [];

  // ── Tool executor ───────────────────────────────────────────
  async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "update_character": {
        const update: Record<string, unknown> = {};
        if (input.description !== undefined) update.description = input.description;
        if (input.personality !== undefined) update.personality = input.personality;
        const { error } = await supabase.from("characters").update(update).eq("id", input.character_id as string).eq("project_id", id);
        if (error) return `ERROR: ${error.message}`;
        await bumpVersion(supabase, "characters", input.character_id as string, id);
        actionsTaken.push({ type: "updated_description", target: `character ${input.character_id}`, result: update });
        return "Character updated; version bumped — downstream headshots/pose sheets/panels are now stale.";
      }
      case "update_location": {
        const update: Record<string, unknown> = {};
        for (const k of ["description", "mood", "time_of_day"]) if (input[k] !== undefined) update[k] = input[k];
        const { error } = await supabase.from("locations").update(update).eq("id", input.location_id as string).eq("project_id", id);
        if (error) return `ERROR: ${error.message}`;
        await bumpVersion(supabase, "locations", input.location_id as string, id);
        actionsTaken.push({ type: "updated_description", target: `location ${input.location_id}`, result: update });
        return "Location updated; version bumped — downstream scouts/panels now stale.";
      }
      case "update_scene": {
        const update: Record<string, unknown> = {};
        for (const k of ["action_summary", "mood", "time_of_day", "location"]) if (input[k] !== undefined) update[k] = input[k];
        const { error } = await supabase.from("scenes").update(update).eq("id", input.scene_id as string).eq("project_id", id);
        if (error) return `ERROR: ${error.message}`;
        await bumpVersion(supabase, "scenes", input.scene_id as string, id);
        actionsTaken.push({ type: "updated_description", target: `scene ${input.scene_id}`, result: update });
        return "Scene updated; version bumped.";
      }
      case "update_panel": {
        const update: Record<string, unknown> = {};
        for (const k of ["action_description", "shot_type", "camera_angle", "camera_movement"]) if (input[k] !== undefined) update[k] = input[k];
        const { error } = await supabase.from("storyboard_panels").update(update).eq("id", input.panel_id as string).eq("project_id", id);
        if (error) return `ERROR: ${error.message}`;
        actionsTaken.push({ type: "updated_description", target: `panel ${input.panel_id}`, result: update });
        return "Panel updated — regenerate its panel art / first frame / clip to see the change.";
      }
      case "update_production_notes": {
        const { error } = await supabase.from("projects").update({ production_notes: input.notes as string }).eq("id", id);
        if (error) return `ERROR: ${error.message}`;
        await bumpVersion(supabase, "projects", id, id);
        actionsTaken.push({ type: "updated_description", target: "production_notes", result: input.notes });
        return "Production notes updated — applies to every image/video generated from now on.";
      }
      case "regenerate_cast_variation": {
        const res = await api(`/projects/${id}/cast`, {
          method: "POST",
          body: JSON.stringify({ character_id: input.character_id, variation_number: input.variation_number || 1 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return `ERROR: ${data.error || res.status}`;
        actionsTaken.push({ type: "regenerated", target: `character ${input.character_id}`, result: { variation: input.variation_number || 1, skipped: data.skipped } });
        return data.skipped ? "That variation slot already exists — pick a different variation_number." : "New headshot variation generated — visible on the casting page.";
      }
      case "regenerate_location_variations": {
        const res = await api(`/projects/${id}/locations`, { method: "POST", body: JSON.stringify({ location_id: input.location_id }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return `ERROR: ${data.error || res.status}`;
        actionsTaken.push({ type: "regenerated", target: `location ${input.location_id}`, result: data });
        return `Location variations generated (${data.totalGenerated ?? "?"} new images).`;
      }
      case "regenerate_scene_scouts": {
        const res = await api(`/projects/${id}/scenes`, { method: "POST", body: JSON.stringify({ scene_id: input.scene_id }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return `ERROR: ${data.error || res.status}`;
        actionsTaken.push({ type: "regenerated", target: `scene ${input.scene_id}`, result: data });
        return `Scene scout images generated (${data.totalGenerated ?? "?"} new).`;
      }
      case "regenerate_first_frame": {
        const res = await api(`/projects/${id}/first-frames`, { method: "POST", body: JSON.stringify({ panel_id: input.panel_id }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return `ERROR: ${data.error || res.status}`;
        actionsTaken.push({ type: "regenerated", target: `panel ${input.panel_id}`, result: data });
        return "New first frame generated — review it on the First Frames page.";
      }
      case "regenerate_video_clip": {
        const payload: Record<string, unknown> = { panel_id: input.panel_id };
        if (input.motion_prompt) payload.motion_prompt = input.motion_prompt;
        const res = await api(`/projects/${id}/video-clips`, { method: "POST", body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return `ERROR: ${data.error || res.status}`;
        actionsTaken.push({ type: "regenerated", target: `panel ${input.panel_id} clip`, result: data });
        return data.clipsCompleted > 0 ? "New clip generated." : "Clip queued (external fulfillment or generation pending).";
      }
      default:
        return `ERROR: unknown tool ${name}`;
    }
  }

  // ── Tool-use loop ───────────────────────────────────────────
  try {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
    let reply = "";

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      const textParts = response.content.filter((b) => b.type === "text");
      const toolUses = response.content.filter((b) => b.type === "tool_use");

      if (toolUses.length === 0) {
        reply = textParts.map((b) => (b.type === "text" ? b.text : "")).join("\n");
        break;
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.type !== "tool_use") continue;
        const result = await runTool(tu.name, (tu.input || {}) as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });

      if (response.stop_reason !== "tool_use") {
        reply = textParts.map((b) => (b.type === "text" ? b.text : "")).join("\n");
        break;
      }
    }

    if (!reply) {
      reply = actionsTaken.length > 0 ? "Done — actions executed (see below)." : "I wasn't able to complete that — try rephrasing or being more specific about which asset you mean.";
    }

    // Lightweight follow-up suggestions based on what happened
    const suggestions: string[] = [];
    if (actionsTaken.some((a) => a.type === "updated_description" && a.target.startsWith("character"))) {
      suggestions.push("Regenerate this character's headshot variations to see the new look");
      suggestions.push("Regenerate the pose sheet once a new headshot is approved");
    }
    if (actionsTaken.some((a) => a.type === "updated_description" && a.target.startsWith("location"))) {
      suggestions.push("Regenerate scene scouts that use this location");
    }
    if (actionsTaken.some((a) => a.target.includes("panel"))) {
      suggestions.push("Check the First Frames page to approve the new frame");
    }

    return NextResponse.json({ reply, actions_taken: actionsTaken, suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Agent crash:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
