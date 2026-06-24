/**
 * Shared helper: detect "the series migration hasn't been applied yet" so the
 * series routes degrade to `{ migrated: false }` instead of 500-ing. Leans on
 * the Postgres error CODES (42P01 undefined_table, 42703 undefined_column) —
 * which PostgREST forwards reliably — and only narrow message fallbacks, so a
 * genuine post-migration error isn't masked as "not migrated".
 */
export function notMigrated(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703") return true;
  const m = (error.message || "").toLowerCase();
  // PostgREST's missing-table-in-cache string + the bare DDL "does not exist".
  return m.includes("schema cache") || m.includes("does not exist");
}
