/**
 * Phase 10 — Video Generation (FINAL_VISION.md).
 *
 * Turns an approved first frame + shot metadata into a video clip via
 * Higgsfield. Two fulfillment paths:
 *
 * 1. REST (HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET set): the route calls
 *    the Higgsfield platform API directly and polls the job.
 * 2. MCP-fulfilled (no key): the clip row is created as 'pending' with the
 *    full motion prompt + model selection stored. A Claude Code / Cowork
 *    session with the Higgsfield MCP connector picks up pending clips,
 *    generates via mcp generate_video, and PATCHes the result back into
 *    /api/projects/:id/video-clips. The app never blocks on this.
 */

export type HiggsfieldModel = "seedance_2_0" | "cinematic_studio_3_0" | "kling3_0";

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
}

/**
 * Model selection per FINAL_VISION.md:
 * - character-heavy (dialogue/action with people) → seedance_2_0 (identity consistency)
 * - cinematic establishing (wide, no/few characters) → cinematic_studio_3_0
 * - ambient/atmospheric (insert/detail shots) → kling3_0 pro (ambient audio)
 */
export function selectVideoModel(req: VideoGenRequest): HiggsfieldModel {
  const shot = (req.shotType || "").toLowerCase();
  if (req.charactersInShot.length > 0) return "seedance_2_0";
  if (shot.includes("wide") || shot.includes("establishing")) return "cinematic_studio_3_0";
  return "kling3_0";
}

/**
 * Motion prompt = camera movement + action + mood + production directive.
 * This is the text Higgsfield animates the first frame with.
 */
export function buildMotionPrompt(req: VideoGenRequest): string {
  const directive = (req.productionNotes || "").trim();
  return [
    directive ? `PRODUCTION DIRECTIVE (locked): ${directive}` : "",
    `Animate this frame as a live-action film shot.`,
    req.cameraMovement && req.cameraMovement !== "static"
      ? `Camera: ${req.cameraMovement} over the duration of the shot.`
      : `Camera: locked-off static shot with subtle natural motion.`,
    `Action: ${req.actionDescription}.`,
    req.mood ? `Mood: ${req.mood}.` : "",
    `Maintain exact character identity, wardrobe, lighting, and color grade from the reference frame.`,
    `Photorealistic, cinematic, no morphing or warping artifacts.`,
  ].filter(Boolean).join(" ");
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

/**
 * Generate a clip from a first frame. If REST credentials are absent, the
 * caller stores the clip as 'pending' for MCP fulfillment — that is the
 * expected mode until Khalil provisions platform API keys.
 */
export async function generateVideoClip(
  firstFrameUrl: string,
  req: VideoGenRequest
): Promise<VideoGenResult> {
  const model = selectVideoModel(req);
  const prompt = buildMotionPrompt(req);
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiSecret = process.env.HIGGSFIELD_API_SECRET;

  if (!apiKey || !apiSecret) {
    return { status: "pending_external", videoUrl: null, jobId: null, model, prompt };
  }

  try {
    // Submit the image-to-video job
    const submitRes = await fetch(`${HF_BASE}/v1/image2video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "hf-api-key": apiKey,
        "hf-secret": apiSecret,
      },
      body: JSON.stringify({
        params: {
          model,
          prompt,
          input_image: { type: "image_url", image_url: firstFrameUrl },
          duration: Math.min(15, Math.max(3, Math.round(req.durationSeconds || 5))),
          ...(model === "kling3_0" ? { mode: "pro" } : {}),
        },
      }),
    });
    if (!submitRes.ok) {
      const body = await submitRes.text();
      return { status: "failed", videoUrl: null, jobId: null, model, prompt, error: `Higgsfield submit ${submitRes.status}: ${body.slice(0, 300)}` };
    }
    const submitData = (await submitRes.json()) as { id?: string; job_id?: string };
    const jobId = submitData.id || submitData.job_id || null;
    if (!jobId) {
      return { status: "failed", videoUrl: null, jobId: null, model, prompt, error: "Higgsfield returned no job id" };
    }

    // Poll up to ~4 minutes (route maxDuration is 300s)
    for (let i = 0; i < 48; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${HF_BASE}/v1/jobs/${jobId}`, {
        headers: { "hf-api-key": apiKey, "hf-secret": apiSecret },
      });
      if (!pollRes.ok) continue;
      const job = (await pollRes.json()) as {
        status?: string;
        results?: { raw?: { url?: string }; min?: { url?: string } };
      };
      const s = (job.status || "").toLowerCase();
      if (s === "completed" || s === "succeeded") {
        const url = job.results?.raw?.url || job.results?.min?.url || null;
        if (url) return { status: "completed", videoUrl: url, jobId, model, prompt };
        return { status: "failed", videoUrl: null, jobId, model, prompt, error: "Job completed but no video URL in results" };
      }
      if (s === "failed" || s === "error" || s === "nsfw") {
        return { status: "failed", videoUrl: null, jobId, model, prompt, error: `Higgsfield job ${s}` };
      }
    }
    // Timed out polling — leave it pending; a later GET/poll can finish it
    return { status: "pending_external", videoUrl: null, jobId, model, prompt };
  } catch (err) {
    return {
      status: "failed",
      videoUrl: null,
      jobId: null,
      model,
      prompt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
