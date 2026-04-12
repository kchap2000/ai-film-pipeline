import { createRouteClient } from "@/lib/supabase-route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DELETE /api/projects/:id/files?file_id=xxx
// Removes a project file record and deletes it from Supabase Storage
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const fileId = req.nextUrl.searchParams.get("file_id");

  if (!fileId) {
    return NextResponse.json({ error: "file_id is required" }, { status: 400 });
  }

  const { supabase, user } = await createRouteClient();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the file record to get its storage_path
  const { data: file, error: fetchError } = await supabase
    .from("project_files")
    .select("id, project_id, storage_path")
    .eq("id", fileId)
    .eq("project_id", id)
    .single();

  if (fetchError || !file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Delete from Supabase Storage
  const { error: storageError } = await supabase.storage
    .from("project-uploads")
    .remove([file.storage_path]);

  if (storageError) {
    // Log but don't fail — the DB record should still be removed
    console.error("Storage delete error:", storageError.message);
  }

  // Delete the DB record
  const { error: dbError } = await supabase
    .from("project_files")
    .delete()
    .eq("id", fileId);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
