import { getSupabase } from "@/lib/supabase";
import { generateLocationImage } from "@/lib/generate-image";
import { NextRequest, NextResponse } from "next/server";

const VARIATIONS_PER_LOCATION = 5;

// GET /api/projects/:id/locations — get locations with variations + linked scenes
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = getSupabase();

  const [locsRes, varsRes, scenesRes] = await Promise.all([
    supabase
      .from("locations")
      .select("*")
      .eq("project_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("location_variations")
      .select("*")
      .eq("project_id", id)
      .order("variation_number", { ascending: true }),
    supabase
      .from("scenes")
      .select("*")
      .eq("project_id", id)
      .order("scene_number", { ascending: true }),
  ]);

  const varsByLocation: Record<string, typeof varsRes.data> = {};
  for (const v of varsRes.data || []) {
    if (!varsByLocation[v.location_id]) {
      varsByLocation[v.location_id] = [];
    }
    varsByLocation[v.location_id]!.push(v);
  }

  // Group scenes by location name for linking
  const scenesByLocation: Record<string, typeof scenesRes.data> = {};
  for (const s of scenesRes.data || []) {
    const loc = s.location?.toLowerCase().trim() || "";
    if (!scenesByLocation[loc]) {
      scenesByLocation[loc] = [];
    }
    scenesByLocation[loc]!.push(s);
  }

  const locations = (locsRes.data || []).map((loc) => ({
    ...loc,
    variations: varsByLocation[loc.id] || [],
    scenes: scenesByLocation[loc.name.toLowerCase().trim()] || [],
  }));

  return NextResponse.json({ locations, allScenes: scenesRes.data || [] });
}

// POST /api/projects/:id/locations — extract unique locations from scenes + generate images
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const locationId = body.location_id;
  const supabase = getSupabase();

  // If no locations exist yet, extract them from scenes
  const { data: existingLocs } = await supabase
    .from("locations")
    .select("id")
    .eq("project_id", id);

  if (!existingLocs || existingLocs.length === 0) {
    // Pull unique locations from scenes
    const { data: scenes } = await supabase
      .from("scenes")
      .select("location, time_of_day, mood")
      .eq("project_id", id);

    if (!scenes || scenes.length === 0) {
      return NextResponse.json(
        { error: "No scenes found. Run extraction first." },
        { status: 400 }
      );
    }

    // Deduplicate by location name (case-insensitive)
    const seen = new Set<string>();
    const uniqueLocations: { name: string; time_of_day: string; mood: string }[] = [];

    for (const scene of scenes) {
      const key = (scene.location || "").toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        uniqueLocations.push({
          name: scene.location,
          time_of_day: scene.time_of_day || "",
          mood: scene.mood || "",
        });
      }
    }

    // Insert locations
    if (uniqueLocations.length > 0) {
      await supabase.from("locations").insert(
        uniqueLocations.map((loc) => ({
          project_id: id,
          name: loc.name,
          description: `${loc.name} — ${loc.time_of_day}`,
          time_of_day: loc.time_of_day,
          mood: loc.mood,
        }))
      );
    }
  }

  // Generate variations for locations
  let query = supabase.from("locations").select("*").eq("project_id", id);
  if (locationId) {
    query = query.eq("id", locationId);
  }
  const { data: locations } = await query;

  let totalGenerated = 0;

  for (const loc of locations || []) {
    const { count } = await supabase
      .from("location_variations")
      .select("*", { count: "exact", head: true })
      .eq("location_id", loc.id);

    const existing = count || 0;
    const needed = VARIATIONS_PER_LOCATION - existing;
    if (needed <= 0) continue;

    for (let i = existing + 1; i <= VARIATIONS_PER_LOCATION; i++) {
      try {
        const result = await generateLocationImage(
          loc.name,
          loc.description,
          loc.time_of_day,
          loc.mood,
          i
        );

        await supabase.from("location_variations").insert({
          location_id: loc.id,
          project_id: id,
          image_url: result.url,
          prompt_used: result.prompt,
          variation_number: i,
          status: "pending",
        });

        totalGenerated++;
      } catch (err) {
        console.error(
          `Failed to generate variation ${i} for ${loc.name}:`,
          err
        );
      }
    }
  }

  // Advance phase
  await supabase
    .from("projects")
    .update({ phase_status: "scene_bible" })
    .eq("id", id)
    .in("phase_status", ["ingestion", "extraction", "bible", "casting", "lock"]);

  return NextResponse.json({
    success: true,
    generated: totalGenerated,
    locations: (locations || []).length,
  });
}

// PATCH /api/projects/:id/locations — approve/reject variation or lock location
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await req.json();
  const supabase = getSupabase();

  // Approve/reject a variation
  if (body.variation_id && body.status) {
    const update: Record<string, string | null> = { status: body.status };
    if (body.status === "rejected" && body.rejection_note) {
      update.rejection_note = body.rejection_note;
    }

    await supabase
      .from("location_variations")
      .update(update)
      .eq("id", body.variation_id);

    if (body.status === "approved" && body.location_id) {
      // Get the approved variation's URL
      const { data: variation } = await supabase
        .from("location_variations")
        .select("image_url")
        .eq("id", body.variation_id)
        .single();

      // Reject others
      await supabase
        .from("location_variations")
        .update({ status: "rejected" })
        .eq("location_id", body.location_id)
        .neq("id", body.variation_id)
        .eq("status", "pending");

      // Set approved image on location
      await supabase
        .from("locations")
        .update({ approved_image_url: variation?.image_url || null })
        .eq("id", body.location_id);
    }

    return NextResponse.json({ success: true });
  }

  // Lock a location
  if (body.location_id && body.lock) {
    await supabase
      .from("locations")
      .update({ locked: true })
      .eq("id", body.location_id);

    return NextResponse.json({ success: true });
  }

  // Lock all locations that have an approved image
  if (body.lock_all) {
    await supabase
      .from("locations")
      .update({ locked: true })
      .eq("project_id", id)
      .not("approved_image_url", "is", null);

    // Check if all are locked
    const { data: unlocked } = await supabase
      .from("locations")
      .select("id")
      .eq("project_id", id)
      .eq("locked", false);

    if (!unlocked || unlocked.length === 0) {
      await supabase
        .from("projects")
        .update({ phase_status: "scene_bible" })
        .eq("id", id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
