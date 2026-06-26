import { createRouteClient } from "@/lib/supabase-route";
import { promoteElementToSeries } from "@/lib/series-propagation";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/series/:id/promote-element  { element_id }
// Lifts a project element to the series asset library (reuses its Higgsfield id).
// Every episode then inherits it via the shared element registry.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { supabase, user } = await createRouteClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.element_id) return NextResponse.json({ error: "element_id required" }, { status: 400 });

  try {
    const promoted = await promoteElementToSeries(supabase, id, body.element_id as string);
    return NextResponse.json({ success: true, ...promoted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /does not exist|could not find|schema cache/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
