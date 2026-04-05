import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const projectId = formData.get("project_id") as string;
  const file = formData.get("file") as File;

  if (!projectId || !file) {
    return NextResponse.json(
      { error: "project_id and file are required" },
      { status: 400 }
    );
  }

  // Verify user owns this project
  const { error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (projectError) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, and TXT files are accepted" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File must be under 20MB" },
      { status: 400 }
    );
  }

  // Upload to Supabase Storage
  const fileExt = file.name.split(".").pop();
  const storagePath = `${projectId}/${uuidv4()}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: storageError } = await supabase.storage
    .from("project-uploads")
    .upload(storagePath, buffer, {
      contentType: file.type,
    });

  if (storageError) {
    return NextResponse.json(
      { error: storageError.message },
      { status: 500 }
    );
  }

  // Record in project_files table
  const { data, error: dbError } = await supabase
    .from("project_files")
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
