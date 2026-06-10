import { createRouteClient } from "@/lib/supabase-route";
import { normalizeProjectAspectRatio } from "@/lib/types";
import { recordProjectActivity } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects — list projects
// ?archived=true  → return only archived projects
// (default)       → return only active (non-archived) projects
export async function GET(req: NextRequest) {
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const showArchived = req.nextUrl.searchParams.get("archived") === "true";

  if (!user.isAnonymous) {
    const { data: collaboratorRows, error: collaboratorError } = await supabase
      .from("project_collaborators")
      .select("project_id")
      .eq("email", user.email ?? "")
      .neq("status", "removed");

    if (collaboratorError) {
      return NextResponse.json({ error: collaboratorError.message }, { status: 500 });
    }

    const collaboratorProjectIds = (collaboratorRows || []).map((row) => row.project_id);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("archived", showArchived)
      .or(`user_id.eq.${user.id}${collaboratorProjectIds.length ? `,id.in.(${collaboratorProjectIds.join(",")})` : ""}`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("archived", showArchived)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/projects — create a new project for the authenticated user
export async function POST(req: NextRequest) {
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, type, client_name } = body;
  const aspectRatio = normalizeProjectAspectRatio(body.aspect_ratio, "9:16");

  if (!title || !type) {
    return NextResponse.json(
      { error: "Title and type are required" },
      { status: 400 }
    );
  }

  const insertProject: Record<string, unknown> = {
    title,
    type,
    client_name: type === "client" ? client_name : null,
    aspect_ratio: aspectRatio,
    phase_status: "ingestion",
    mode: body.mode === "auto" ? "auto" : "manual",
  };

  if (!user.isAnonymous) {
    insertProject.user_id = user.id;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert(insertProject)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!user.isAnonymous) {
    await supabase.from("project_collaborators").upsert(
      {
        project_id: data.id,
        user_id: user.id,
        email: user.email ?? "",
        role: "owner",
        status: "active",
        invited_by: user.id,
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "project_id,email" }
    );
  }

  await recordProjectActivity(supabase, {
    projectId: data.id,
    activityType: "project_created",
    title: "Project created",
    body: `${title} started in ${aspectRatio}.`,
    actorUserId: !user.isAnonymous ? user.id : null,
    actorEmail: user.email,
    metadata: { type, aspect_ratio: aspectRatio },
  });

  return NextResponse.json(data, { status: 201 });
}
