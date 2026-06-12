import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettingProfile } from "@/lib/extract";

/**
 * Learning system. Two persistent signals make every run better than the
 * last:
 *
 * 1. SETTING PROFILE (projects.setting_profile) — the world's physical
 *    rules derived at extraction (era, technology level, wardrobe rules,
 *    forbidden anachronisms). Injected into every generation prompt as
 *    hard constraints, and checked by the realism gate.
 * 2. LESSONS (pipeline_lessons) — durable corrections written by QA and
 *    the gates when they catch a failure, read back into prompts on every
 *    subsequent run. 'project' scope refines this film; 'global' scope
 *    carries across all future films. Repeated confirmations bump
 *    times_confirmed so the strongest lessons rank first.
 */

export interface Lesson {
  category: string;
  lesson: string;
  times_confirmed: number;
}

/** Record (or reinforce) a lesson. Dedupe via the unique md5 index. */
export async function recordLesson(
  supabase: SupabaseClient,
  opts: { scope: "global" | "project"; projectId?: string | null; category: string; lesson: string; evidence?: string }
): Promise<void> {
  const lesson = opts.lesson.trim();
  if (lesson.length < 12) return; // too vague to be a lesson
  const { data: existing } = await supabase
    .from("pipeline_lessons")
    .select("id, times_confirmed")
    .eq("scope", opts.scope)
    .eq("category", opts.category)
    .eq("lesson", lesson)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("pipeline_lessons")
      .update({ times_confirmed: (existing.times_confirmed || 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("pipeline_lessons").insert({
    scope: opts.scope,
    project_id: opts.scope === "project" ? opts.projectId : null,
    category: opts.category,
    lesson,
    evidence: opts.evidence?.slice(0, 500) || null,
  });
}

/** Top lessons for prompt injection: project-scoped first, then global. */
export async function fetchLessons(
  supabase: SupabaseClient,
  projectId: string,
  limit = 10
): Promise<Lesson[]> {
  const [proj, glob] = await Promise.all([
    supabase
      .from("pipeline_lessons")
      .select("category, lesson, times_confirmed")
      .eq("scope", "project")
      .eq("project_id", projectId)
      .order("times_confirmed", { ascending: false })
      .limit(limit),
    supabase
      .from("pipeline_lessons")
      .select("category, lesson, times_confirmed")
      .eq("scope", "global")
      .order("times_confirmed", { ascending: false })
      .limit(limit),
  ]);
  const seen = new Set<string>();
  const out: Lesson[] = [];
  for (const l of [...(proj.data || []), ...(glob.data || [])]) {
    if (seen.has(l.lesson)) continue;
    seen.add(l.lesson);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The combined directive block injected into generation prompts:
 * setting-profile hard rules + accumulated lessons. Appended to
 * production notes so it flows through every existing prompt path
 * (storyboard art, first frames, element plates, video prompts).
 */
export async function getWorldDirectives(
  supabase: SupabaseClient,
  projectId: string
): Promise<string> {
  const [{ data: project }, lessons] = await Promise.all([
    supabase.from("projects").select("setting_profile").eq("id", projectId).single(),
    fetchLessons(supabase, projectId),
  ]);
  const parts: string[] = [];
  const sp = project?.setting_profile as SettingProfile | null;
  if (sp?.era) {
    parts.push(
      [
        `WORLD RULES (non-negotiable): the setting is ${sp.era}.`,
        sp.technology_level ? `Technology level: ${sp.technology_level}.` : "",
        sp.wardrobe_rules?.length ? `Wardrobe in this world: ${sp.wardrobe_rules.join("; ")}.` : "",
        sp.forbidden?.length ? `NEVER depict (anachronisms — automatic rejection): ${sp.forbidden.join("; ")}.` : "",
      ].filter(Boolean).join(" ")
    );
  }
  if (lessons.length) {
    parts.push(
      `LESSONS FROM PRIOR REVIEWS (apply all): ${lessons.map((l) => l.lesson).join(" | ")}`
    );
  }
  return parts.join("\n\n");
}
