import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/first-frames/image?frame_id=xxx
// Lazy-load the image bytes (base64 data URL) or HTTPS Storage URL for a
// single first_frames row. Mirrors the pattern used by every other *image*
// endpoint (cast/locations/scenes/storyboard-panel) so the bulk GET can stay
// metadata-only and not bust the 5 MB Supabase payload ceiling.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const frameId = req.nextUrl.searchParams.get("frame_id");
  if (!frameId) {
    return NextResponse.json({ error: "frame_id required" }, { status: 400 });
  }

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("first_frames")
    .select("image_url")
    .eq("id", frameId)
    .eq("project_id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ image_url: data.image_url });
}
