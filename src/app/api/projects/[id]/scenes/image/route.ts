import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/scenes/image?variation_id=xxx
// GET /api/projects/:id/scenes/image?scene_id=xxx&type=approved
// Returns { image_url } or { approved_scout_image_url } for lazy loading.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const variationId = req.nextUrl.searchParams.get("variation_id");
  const sceneId = req.nextUrl.searchParams.get("scene_id");
  const type = req.nextUrl.searchParams.get("type");

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (variationId) {
    const { data, error } = await supabase
      .from("scene_variations")
      .select("image_url")
      .eq("id", variationId)
      .eq("project_id", params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ image_url: data.image_url });
  }

  if (sceneId && type === "approved") {
    const { data, error } = await supabase
      .from("scenes")
      .select("approved_scout_image_url")
      .eq("id", sceneId)
      .eq("project_id", params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ approved_scout_image_url: data.approved_scout_image_url });
  }

  return NextResponse.json({ error: "variation_id or scene_id+type required" }, { status: 400 });
}
