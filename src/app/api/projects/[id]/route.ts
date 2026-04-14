import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

// B1 fix: prevent Next.js from caching this route so phase_status is always fresh
export const dynamic = "force-dynamic";

// GET /api/projects/:id — get project with its files
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [projectRes, filesRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single(),
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

// PATCH /api/projects/:id — update project fields (e.g. archived: true/false)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Only allow safe fields to be patched this way
  const allowed = ["archived", "title", "client_name", "phase_status", "production_notes"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/projects/:id — hard delete (cascades to all child tables)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
