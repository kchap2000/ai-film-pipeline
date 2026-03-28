import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// B1 fix: prevent Next.js from caching this route so phase_status is always fresh
export const dynamic = "force-dynamic";

// GET /api/projects/:id — get project with its files
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [projectRes, filesRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (projectRes.error) {
    return NextResponse.json(
      { error: projectRes.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    project: projectRes.data,
    files: filesRes.data || [],
  });
}
