import { createRouteClient } from "@/lib/supabase-route";
import {
  COLLABORATOR_ROLE_LABELS,
  getProjectAccess,
  normalizeCollaboratorRole,
} from "@/lib/project-access";
import { recordProjectActivity } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function originFromRequest(req: NextRequest) {
  return req.headers.get("origin") || new URL(req.url).origin;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("project_collaborators")
    .select("id, email, user_id, role, status, invite_token, invited_at, accepted_at, last_accessed_at, created_at")
    .eq("project_id", id)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = originFromRequest(req);
  return NextResponse.json({
    access,
    collaborators: (data || []).map((row) => ({
      ...row,
      role_label: COLLABORATOR_ROLE_LABELS[normalizeCollaboratorRole(row.role)],
      invite_url:
        row.status === "pending" && row.invite_token
          ? `${origin}/projects/${id}?invite=${row.invite_token}`
          : null,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canManage) {
    return NextResponse.json({ error: "Only owners and producers can invite collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const role = normalizeCollaboratorRole(body.role);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (role === "owner") {
    return NextResponse.json({ error: "Use producer/client/reviewer for invitations" }, { status: 400 });
  }

  const inviteToken = crypto.randomUUID();
  const { data, error } = await supabase
    .from("project_collaborators")
    .upsert(
      {
        project_id: id,
        email,
        role,
        status: "pending",
        invite_token: inviteToken,
        invited_by: user && !user.isAnonymous ? user.id : null,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "project_id,email" }
    )
    .select("id, email, role, status, invite_token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: "collaborator_invited",
    title: `Invited ${email}`,
    body: `${COLLABORATOR_ROLE_LABELS[role]} access created.`,
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: { collaborator_id: data.id, email, role },
  });

  const invite_url = `${originFromRequest(req)}/projects/${id}?invite=${data.invite_token}`;
  return NextResponse.json({ collaborator: { ...data, invite_url } }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canManage) {
    return NextResponse.json({ error: "Only owners and producers can manage collaborators" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const collaboratorId = body.collaborator_id as string | undefined;
  if (!collaboratorId) {
    return NextResponse.json({ error: "collaborator_id is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.role) update.role = normalizeCollaboratorRole(body.role);
  if (body.status && ["pending", "active", "removed"].includes(body.status)) {
    update.status = body.status;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("project_collaborators")
    .update(update)
    .eq("id", collaboratorId)
    .eq("project_id", id)
    .select("id, email, role, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: "collaborator_updated",
    title: `Updated ${data.email}`,
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? null,
    metadata: { collaborator_id: data.id, ...update },
  });

  return NextResponse.json({ collaborator: data });
}
