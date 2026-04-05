import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/cast/image?variation_id=xxx
// GET /api/projects/:id/cast/image?character_id=xxx&type=pose
// Returns { image_url } or { pose_sheet_url } for lazy loading.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const variationId = req.nextUrl.searchParams.get("variation_id");
  const characterId = req.nextUrl.searchParams.get("character_id");
  const type = req.nextUrl.searchParams.get("type");

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (variationId) {
    const { data, error } = await supabase
      .from("cast_variations")
      .select("image_url")
      .eq("id", variationId)
      .eq("project_id", params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ image_url: data.image_url });
  }

  if (characterId && type === "pose") {
    const { data, error } = await supabase
      .from("characters")
      .select("pose_sheet_url")
      .eq("id", characterId)
      .eq("project_id", params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ pose_sheet_url: data.pose_sheet_url });
  }

  return NextResponse.json({ error: "variation_id or character_id+type required" }, { status: 400 });
}
