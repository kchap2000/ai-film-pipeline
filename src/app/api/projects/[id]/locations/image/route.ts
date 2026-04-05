import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/locations/image?variation_id=xxx
// GET /api/projects/:id/locations/image?location_id=xxx&type=approved
// Returns { image_url } or { approved_image_url } for lazy loading.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const variationId = req.nextUrl.searchParams.get("variation_id");
  const locationId = req.nextUrl.searchParams.get("location_id");
  const type = req.nextUrl.searchParams.get("type");

  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (variationId) {
    const { data, error } = await supabase
      .from("location_variations")
      .select("image_url")
      .eq("id", variationId)
      .eq("project_id", params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ image_url: data.image_url });
  }

  if (locationId && type === "approved") {
    const { data, error } = await supabase
      .from("locations")
      .select("approved_image_url")
      .eq("id", locationId)
      .eq("project_id", params.id)
      .single();

    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ approved_image_url: data.approved_image_url });
  }

  return NextResponse.json({ error: "variation_id or location_id+type required" }, { status: 400 });
}
