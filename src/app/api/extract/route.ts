import { getSupabase } from "@/lib/supabase";
import { extractFromText } from "@/lib/extract";
import { NextRequest, NextResponse } from "next/server";
// Use pdf-parse/lib/pdf-parse.js directly to skip the test-file initialization
// that causes failures in Vercel serverless environments
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

export const maxDuration = 60; // Allow up to 60s for Claude extraction

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { project_id } = body;

  if (!project_id) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // 1. Verify project exists
  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // 2. Fetch uploaded files for this project
  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("*")
    .eq("project_id", project_id)
    .order("uploaded_at", { ascending: true });

  if (filesError || !files || files.length === 0) {
    return NextResponse.json(
      { error: "No files uploaded for this project. Upload documents first." },
      { status: 400 }
    );
  }

  // 3. Download and read text content from each file
  const textParts: string[] = [];

  for (const file of files) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("project-uploads")
      .download(file.storage_path);

    if (downloadError || !fileData) {
      console.error(
        `Failed to download ${file.file_name}:`,
        downloadError?.message
      );
      continue;
    }

    // For now, read as text. PDF/DOCX binary parsing can be added later.
    // Plain text files work directly. PDF/DOCX will need a parser in a future iteration.
    let text = "";
    if (
      file.file_type === "text/plain" ||
      file.file_name.endsWith(".txt")
    ) {
      text = await fileData.text();
    } else if (
      file.file_type === "application/pdf" ||
      file.file_name.endsWith(".pdf")
    ) {
      // PDF: extract text using pdf-parse
      const buffer = await fileData.arrayBuffer();
      text = await extractTextFromPDF(Buffer.from(buffer));
    } else if (
      file.file_type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.file_name.endsWith(".docx")
    ) {
      // DOCX: extract text from XML content
      const buffer = await fileData.arrayBuffer();
      text = await extractTextFromDOCX(Buffer.from(buffer));
    }

    if (text.trim()) {
      textParts.push(`--- Document: ${file.file_name} ---\n\n${text}`);
    }
  }

  if (textParts.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not extract readable text from any uploaded files. Ensure files contain text content.",
      },
      { status: 400 }
    );
  }

  const combinedText = textParts.join("\n\n");

  // 4. Run Claude extraction
  let extraction;
  try {
    extraction = await extractFromText(combinedText);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 5. Clear previous extraction data for this project (re-extraction replaces old data)
  await Promise.all([
    supabase.from("characters").delete().eq("project_id", project_id),
    supabase.from("scenes").delete().eq("project_id", project_id),
    supabase.from("extractions").delete().eq("project_id", project_id),
  ]);

  // 6. Insert characters
  if (extraction.characters.length > 0) {
    const { error: charError } = await supabase.from("characters").insert(
      extraction.characters.map((c) => ({
        project_id,
        name: c.name,
        description: c.description || "",
        role: c.role || "minor",
        personality: c.personality || "",
        voice_only: c.voice_only ?? false,
      }))
    );
    if (charError) {
      console.error("Failed to insert characters:", charError.message);
    }
  }

  // 7. Insert scenes
  if (extraction.scenes.length > 0) {
    const { error: sceneError } = await supabase.from("scenes").insert(
      extraction.scenes.map((s) => ({
        project_id,
        scene_number: s.scene_number,
        location: s.location || "",
        time_of_day: s.time_of_day || "",
        scene_type: s.scene_type || "real",
        action_summary: s.action_summary || "",
        mood: s.mood || "",
        props: s.props || [],
        wardrobe: s.wardrobe || [],
        characters_present: s.characters_present || [],
      }))
    );
    if (sceneError) {
      console.error("Failed to insert scenes:", sceneError.message);
    }
  }

  // 8. Store extraction metadata + structure
  await supabase.from("extractions").insert({
    project_id,
    structure: extraction.structure,
    raw_response: JSON.stringify(extraction),
  });

  // 9. Advance project phase to 'extraction'
  await supabase
    .from("projects")
    .update({ phase_status: "extraction" })
    .eq("id", project_id);

  return NextResponse.json({
    success: true,
    characters: extraction.characters.length,
    scenes: extraction.scenes.length,
    structure: extraction.structure,
  });
}

/**
 * PDF text extraction using pdf-parse.
 * Handles FlateDecode-compressed PDFs correctly.
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (err) {
    console.error("PDF parse failed:", err);
    return "";
  }
}

/**
 * Basic DOCX text extraction — DOCX is a ZIP containing XML.
 * Extracts text from word/document.xml.
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  // DOCX files are ZIP archives. We need to find and read word/document.xml
  // Using a minimal approach without external zip libraries.
  try {
    // Look for the PK zip signature
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return "";
    }

    // Find the XML content between <w:t> tags in the raw buffer
    const content = buffer.toString("utf8");
    const textParts: string[] = [];
    const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let wtMatch;

    while ((wtMatch = wtRegex.exec(content)) !== null) {
      textParts.push(wtMatch[1]);
    }

    // Add paragraph breaks at </w:p> boundaries
    const fullXml = content;
    const paragraphs: string[] = [];
    const paraRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let paraMatch;

    while ((paraMatch = paraRegex.exec(fullXml)) !== null) {
      const paraContent = paraMatch[1];
      const paraTexts: string[] = [];
      const innerWt = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let innerMatch;
      while ((innerMatch = innerWt.exec(paraContent)) !== null) {
        paraTexts.push(innerMatch[1]);
      }
      if (paraTexts.length > 0) {
        paragraphs.push(paraTexts.join(""));
      }
    }

    return paragraphs.length > 0
      ? paragraphs.join("\n")
      : textParts.join(" ");
  } catch {
    return "";
  }
}
