import { getStalenessReport } from "@/lib/provenance";
import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/:id/staleness — report generated assets whose recorded
// source versions are behind the current project/character/location/scene/panel.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const report = await getStalenessReport(supabase, id);
  return NextResponse.json(report);
}
