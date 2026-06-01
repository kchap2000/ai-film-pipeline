import { getSupabase } from "@/lib/supabase";
import { createClient as createServerSupabaseClient } from "@/lib/supabase-server";
import type { RouteUser } from "@/lib/project-access";

/**
 * Auth-aware Supabase client for Route Handlers (app/api/).
 * Returns the app data client and current user context for Route Handlers.
 * The data client intentionally remains the existing shared Supabase client so
 * current routes keep working while auth/collaborators are rolled in. We still
 * read the real Supabase session when present so project access can distinguish
 * owner/collaborator/client roles.
 */
export async function createRouteClient() {
  const supabase = getSupabase();

  let user: RouteUser = { id: "anonymous", email: null, isAnonymous: true };
  try {
    const authClient = await createServerSupabaseClient();
    const { data } = await authClient.auth.getUser();
    if (data.user) {
      user = {
        id: data.user.id,
        email: data.user.email ?? null,
        isAnonymous: false,
      };
    }
  } catch {
    // Keep current internal/public preview flows alive if auth cookies are absent
    // or the auth client cannot initialize in a route context.
  }

  return { supabase, user };
}
