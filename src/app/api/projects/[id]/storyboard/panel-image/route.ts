import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/storyboard/panel-image?panel_id=xxx
// Returns just the image_url for a single panel (lazy-loaded by UI).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const panelId = req.nextUrl.searchParams.get("panel_id");
  if (!panelId) {
    return NextResponse.json({ error: "panel_id is required" }, { status: 400 });
  }

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("storyboard_panels")
    .select("image_url")
    .eq("id", panelId)
    .eq("project_id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  return NextResponse.json({ image_url: data.image_url });
}
