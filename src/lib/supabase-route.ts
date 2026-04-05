import { getSupabase } from "@/lib/supabase";

/**
 * Auth-aware Supabase client for Route Handlers (app/api/).
 * Returns the client and the authenticated user (or a stub).
 *
 * Auth is not wired up yet — returns a placeholder user so existing
 * if (!user) 401 guards pass through. Once Google OAuth is enabled,
 * this will check the real session via @supabase/ssr.
 */
export async function createRouteClient() {
  const supabase = getSupabase();

  // Stub user until auth is wired up — routes stay functional
  const user = { id: "anonymous", email: null } as { id: string; email: string | null };

  return { supabase, user };
}
