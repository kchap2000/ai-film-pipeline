/**
 * Phase 10 — Video Generation (FINAL_VISION.md).
 *
 * Turns an approved first frame + shot metadata into a video clip via the
 * Higgsfield platform REST API. Contract verified against the official
 * higgsfield-js SDK (github.com/higgsfield-ai/higgsfield-js):
 *   - Auth:    Authorization: Key KEY_ID:KEY_SECRET
 *   - Submit:  POST /v1/image2video/dop  { model, prompt, input_images }
 *   - Poll:    GET  /requests/{request_id}/status
 *              → { status: queued|in_progress|completed|failed|nsfw,
 *                  video: { url } }
 *
 * Two fulfillment paths:
 * 1. REST (HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET set): submit + poll.
 * 2. MCP-fulfilled (no creds): the clip row stays 'pending' carrying the
 *    full motion prompt + model so a Cowork session with the Higgsfield
 *    connector generates it and PATCHes video_url back.
 */

export type HiggsfieldModel = "seedance_2_0" | "cinematic_studio_3_0" | "kling3_0";

import { buildShotPrompt, RegistryElement } from "./prompt-engine";

export interface VideoGenRequest {
  panelNumber: number;
  sceneNumber: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  actionDescription: string;
  mood: string;
  durationSeconds: number;
  charactersInShot: string[];
  productionNotes?: string;
  aspectRatio?: string;
  /**
   * Spoken lines for this shot (from storyboard_panels.dialogue, written
   * by the Claude shot breakdown). Rendered as a DIALOGUE / SPOKEN AUDIO
   * section — Seedance/Kling generate the speech with the video.
   */
  dialogue?: string;
  /**
   * Full element registry for the project (characters, props, outfits,
   * environments). The prompt engine swaps match-terms in the action text
   * for <<<element_id>>> placeholders — Higgsfield injects the locked
   * reference, preventing face / wardrobe / prop / set drift.
   */
  registryElements?: RegistryElement[];
  locationElementId?: string | null;
}

/**
 * Shot-intent model selection per FINAL_VISION.md. Stored as metadata on
 * the clip; the REST DoP endpoint maps everything to HIGGSFIELD_MODEL
 * (default dop-turbo) since that's the documented platform-API model. The
 * intent labels stay useful for MCP fulfillment, which can route per model.
 */
export function selectVideoModel(req: VideoGenRequest): HiggsfieldModel {
  const shot = (req.shotType || "").toLowerCase();
  if (req.charactersInShot.length > 0) return "seedance_2_0";
  if (shot.includes("wide") || shot.includes("establishing")) return "cinematic_studio_3_0";
  return "kling3_0";
}

/**
 * Motion prompt v2 — structured VISUALS / DIALOGUE / SOUND format (the
 * format proven on Khalil's manual Higgsfield work). Character names are
 * replaced with <<<element_id>>> placeholders so the backend injects the
 * locked reference image; the location element anchors the set.
 */
export function buildMotionPrompt(req: VideoGenRequest): string {
  // Delegates to the cinematic prompt engine (see PROMPTING.md):
  // technical preamble → VISUALS → DIALOGUE → CONTINUITY → metadata footer,
  // with <<<element_id>>> swaps for characters / props / outfits / sets.
  return buildShotPrompt({
    shotType: req.shotType,
    cameraAngle: req.cameraAngle,
    cameraMovement: req.cameraMovement,
    actionDescription: req.actionDescription,
    mood: req.mood,
    dialogue: req.dialogue,
    durationSeconds: req.durationSeconds,
    aspectRatio: req.aspectRatio || "16:9",
    productionNotes: req.productionNotes,
    elements: req.registryElements || [],
    locationElementId: req.locationElementId,
    charactersInShot: req.charactersInShot,
  });
}

export interface VideoGenResult {
  status: "completed" | "pending_external" | "failed";
  videoUrl: string | null;
  jobId: string | null;
  model: HiggsfieldModel;
  prompt: string;
  error?: string;
}

const HF_BASE = process.env.HIGGSFIELD_API_BASE || "https://platform.higgsfield.ai";
// Platform REST model for the DoP image2video endpoint
const HF_REST_MODEL = process.env.HIGGSFIELD_MODEL || "dop-turbo";

function authHeader(): string | null {
  // Accept both our names and the official SDK's documented env names
  // (HF_API_KEY / HF_SECRET) — whichever is configured in Vercel.
  const keyId = process.env.HIGGSFIELD_API_KEY || process.env.HF_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET || process.env.HF_SECRET;
  if (!keyId || !secret) return null;
  return `Key ${keyId}:${secret}`;
}

/**
 * Generate a clip from a first frame (must be an HTTPS URL — the route
 * uploads data-URL frames to Supabase Storage first). Returns
 * pending_external when no REST credentials are configured.
 */
export async function generateVideoClip(
  firstFrameUrl: string,
  req: VideoGenRequest
): Promise<VideoGenResult> {
  const model = selectVideoModel(req);
  const prompt = buildMotionPrompt(req);
  const auth = authHeader();

  if (!auth) {
    return { status: "pending_external", videoUrl: null, jobId: null, model, prompt };
  }

  try {
    // Submit the image-to-video job
    const submitRes = await fetch(`${HF_BASE}/v1/image2video/dop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
        "User-Agent": "ai-film-pipeline/1.0",
      },
      body: JSON.stringify({
        model: HF_REST_MODEL,
        prompt,
        input_images: [{ type: "image_url", image_url: firstFrameUrl }],
      }),
    });
    if (!submitRes.ok) {
      const body = await submitRes.text();
      return {
        status: "failed", videoUrl: null, jobId: null, model, prompt,
        error: `Higgsfield submit ${submitRes.status}: ${body.slice(0, 300)}`,
      };
    }
    const submitData = (await submitRes.json()) as {
      request_id?: string;
      id?: string;
      jobs?: Array<{ id?: string; request_id?: string }>;
    };
    const jobId =
      submitData.request_id ||
      submitData.id ||
      submitData.jobs?.[0]?.request_id ||
      submitData.jobs?.[0]?.id ||
      null;
    if (!jobId) {
      return {
        status: "failed", videoUrl: null, jobId: null, model, prompt,
        error: `Higgsfield returned no request id: ${JSON.stringify(submitData).slice(0, 200)}`,
      };
    }

    // Poll up to ~4 minutes (route maxDuration is 300s)
    const result = await pollHiggsfieldJob(jobId);
    return { ...result, model, prompt };
  } catch (err) {
    return {
      status: "failed", videoUrl: null, jobId: null, model, prompt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Poll /requests/{id}/status until terminal or ~4 minutes elapse.
 * Exported so the video-clips GET route can finish clips whose first
 * submit timed out (status stayed 'pending' with a job id).
 */
export async function pollHiggsfieldJob(
  jobId: string,
  // 40 × 5s = 200s: leaves headroom inside the 300s video-clips route when
  // it's invoked through the orchestrator (another 300s function).
  maxPolls = 40
): Promise<{ status: "completed" | "pending_external" | "failed"; videoUrl: string | null; jobId: string; error?: string }> {
  const auth = authHeader();
  if (!auth) return { status: "pending_external", videoUrl: null, jobId };

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    let pollRes: Response;
    try {
      pollRes = await fetch(`${HF_BASE}/requests/${jobId}/status`, {
        headers: { Authorization: auth, "User-Agent": "ai-film-pipeline/1.0" },
      });
    } catch {
      continue; // transient network error — keep polling
    }
    if (!pollRes.ok) continue;
    const job = (await pollRes.json()) as {
      status?: string;
      video?: { url?: string };
      results?: { raw?: { url?: string }; min?: { url?: string } };
    };
    const s = (job.status || "").toLowerCase();
    if (s === "completed") {
      const url = job.video?.url || job.results?.raw?.url || job.results?.min?.url || null;
      if (url) return { status: "completed", videoUrl: url, jobId };
      return { status: "failed", videoUrl: null, jobId, error: "Job completed but no video URL in response" };
    }
    if (s === "failed" || s === "error") {
      return { status: "failed", videoUrl: null, jobId, error: "Higgsfield job failed" };
    }
    if (s === "nsfw") {
      return { status: "failed", videoUrl: null, jobId, error: "Higgsfield flagged content (nsfw) — adjust the frame or prompt" };
    }
    // queued / in_progress → keep polling
  }
  // Timed out — job may still finish; caller keeps the clip 'pending' with
  // the job id so a later poll can complete it.
  return { status: "pending_external", videoUrl: null, jobId };
}
