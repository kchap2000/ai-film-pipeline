import { createRouteClient } from "@/lib/supabase-route";
import { recordProjectActivity } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const body = await req.json().catch(() => ({}));
  const token = body.token as string | undefined;
  if (!token) {
    return NextResponse.json({ error: "Invite token is required" }, { status: 400 });
  }

  const { data: invite, error: inviteError } = await supabase
    .from("project_collaborators")
    .select("id, email, role, status")
    .eq("project_id", id)
    .eq("invite_token", token)
    .neq("status", "removed")
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (!user?.isAnonymous && user.email && invite.email !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This invite is for a different email address" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("project_collaborators")
    .update({
      status: "active",
      user_id: user && !user.isAnonymous ? user.id : null,
      accepted_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
    })
    .eq("id", invite.id)
    .select("id, email, role, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordProjectActivity(supabase, {
    projectId: id,
    activityType: "collaborator_joined",
    title: `${data.email} joined the project`,
    actorUserId: user && !user.isAnonymous ? user.id : null,
    actorEmail: user?.email ?? data.email,
    metadata: { collaborator_id: data.id, role: data.role },
  });

  return NextResponse.json({ collaborator: data });
}
