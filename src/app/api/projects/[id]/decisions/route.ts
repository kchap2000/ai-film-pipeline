import { createRouteClient } from "@/lib/supabase-route";
import { getProjectAccess } from "@/lib/project-access";
import { evaluateProjectAutomation, recordProjectDecision } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("project_decisions")
    .select("id, decision_type, subject_type, subject_id, status, notes, decided_by_email, metadata, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decisions: data || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.decision_type || !body.subject_type || !body.subject_id || !body.status) {
    return NextResponse.json(
      { error: "decision_type, subject_type, subject_id, and status are required" },
      { status: 400 }
    );
  }

  const decisionId = await recordProjectDecision(supabase, {
    projectId: id,
    decisionType: String(body.decision_type),
    subjectType: String(body.subject_type),
    subjectId: String(body.subject_id),
    status: body.status,
    notes: body.notes ?? null,
    metadata: body.metadata ?? {},
    user,
  });
  const automation = await evaluateProjectAutomation(supabase, id);

  return NextResponse.json({ success: true, decision_id: decisionId, automation });
}
