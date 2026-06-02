import { createRouteClient } from "@/lib/supabase-route";
import { getProjectAccess } from "@/lib/project-access";
import { evaluateProjectAutomation } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function handle(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  const access = await getProjectAccess(supabase, id, user);
  if (!access?.canReview) {
    return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
  }

  const automation = await evaluateProjectAutomation(supabase, id);
  return NextResponse.json({ automation });
}

export const GET = handle;
export const POST = handle;
