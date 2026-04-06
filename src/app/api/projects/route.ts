import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects — list projects for the authenticated user
export async function GET() {
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
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

  if (!title || !type) {
    return NextResponse.json(
      { error: "Title and type are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title,
      type,
      client_name: type === "client" ? client_name : null,
      phase_status: "ingestion",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
