import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetType, SourceType, StaleAsset } from "@/lib/types";

type VersionedTable = "projects" | "characters" | "locations" | "scenes" | "storyboard_panels";

const SOURCE_TABLE: Record<SourceType, VersionedTable> = {
  project: "projects",
  character: "characters",
  location: "locations",
  scene: "scenes",
  storyboard_panel: "storyboard_panels",
};

const MISSING_SCHEMA_HINTS = [
  "asset_provenance",
  "source_version",
  "version",
  "column",
  "schema cache",
  "relation",
];

export interface ProvenanceSource {
  sourceType: SourceType;
  sourceId: string;
  sourceVersion?: number | null;
  relationship?: string;
}

export interface RecordProvenanceInput {
  projectId: string;
  assetType: AssetType;
  assetId: string;
  sources: ProvenanceSource[];
  metadata?: Record<string, unknown>;
}

export interface StalenessReport {
  available: boolean;
  stale: StaleAsset[];
  by_asset_type: Partial<Record<AssetType, StaleAsset[]>>;
  summary: {
    stale_count: number;
    checked_count: number;
  };
}

function isMissingSchemaError(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return MISSING_SCHEMA_HINTS.some((hint) => message.includes(hint));
}

function logOptionalSchemaWarning(context: string, error: { message?: string } | null): void {
  if (error && isMissingSchemaError(error)) {
    console.warn(`${context}: Project Brain schema is not applied yet (${error.message})`);
  } else if (error) {
    console.error(`${context}:`, error.message);
  }
}

export async function bumpVersion(
  supabase: SupabaseClient,
  table: VersionedTable,
  id: string,
  projectId?: string
): Promise<number | null> {
  let query = supabase.from(table).select("version").eq("id", id);
  if (table !== "projects" && projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query.single();
  if (error) {
    logOptionalSchemaWarning(`bumpVersion(${table}:${id}) select`, error);
    return null;
  }

  const current = typeof data?.version === "number" ? data.version : 1;
  const next = current + 1;
  let updateQuery = supabase.from(table).update({ version: next }).eq("id", id);
  if (table !== "projects" && projectId) {
    updateQuery = updateQuery.eq("project_id", projectId);
  }

  const { error: updateError } = await updateQuery;
  if (updateError) {
    logOptionalSchemaWarning(`bumpVersion(${table}:${id}) update`, updateError);
    return null;
  }

  return next;
}

async function getSourceVersion(
  supabase: SupabaseClient,
  source: ProvenanceSource
): Promise<number | null> {
  if (typeof source.sourceVersion === "number") return source.sourceVersion;
  const table = SOURCE_TABLE[source.sourceType];
  const { data, error } = await supabase
    .from(table)
    .select("version")
    .eq("id", source.sourceId)
    .single();

  if (error) {
    logOptionalSchemaWarning(
      `getSourceVersion(${source.sourceType}:${source.sourceId})`,
      error
    );
    return null;
  }

  return typeof data?.version === "number" ? data.version : 1;
}

export async function recordProvenance(
  supabase: SupabaseClient,
  input: RecordProvenanceInput
): Promise<void> {
  const rows = [];
  for (const source of input.sources) {
    if (!source.sourceId) continue;
    const sourceVersion = await getSourceVersion(supabase, source);
    if (sourceVersion === null) continue;
    rows.push({
      project_id: input.projectId,
      asset_type: input.assetType,
      asset_id: input.assetId,
      source_type: source.sourceType,
      source_id: source.sourceId,
      source_version: sourceVersion,
      relationship: source.relationship || null,
      metadata: input.metadata || {},
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("asset_provenance").insert(rows);
  if (error) {
    logOptionalSchemaWarning(`recordProvenance(${input.assetType}:${input.assetId})`, error);
  }
}

async function currentVersionFor(
  supabase: SupabaseClient,
  sourceType: SourceType,
  sourceId: string
): Promise<number | null> {
  const table = SOURCE_TABLE[sourceType];
  const { data, error } = await supabase
    .from(table)
    .select("version")
    .eq("id", sourceId)
    .single();

  if (error) {
    logOptionalSchemaWarning(`currentVersionFor(${sourceType}:${sourceId})`, error);
    return null;
  }

  return typeof data?.version === "number" ? data.version : 1;
}

export async function getStalenessReport(
  supabase: SupabaseClient,
  projectId: string
): Promise<StalenessReport> {
  const { data, error } = await supabase
    .from("asset_provenance")
    .select("asset_type, asset_id, source_type, source_id, source_version, relationship")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    logOptionalSchemaWarning(`getStalenessReport(${projectId})`, error);
    return {
      available: !isMissingSchemaError(error),
      stale: [],
      by_asset_type: {},
      summary: { stale_count: 0, checked_count: 0 },
    };
  }

  const latestByPair = new Map<string, (typeof data)[number]>();
  for (const row of data || []) {
    const key = [
      row.asset_type,
      row.asset_id,
      row.source_type,
      row.source_id,
      row.relationship || "",
    ].join(":");
    if (!latestByPair.has(key)) latestByPair.set(key, row);
  }

  const stale: StaleAsset[] = [];
  for (const row of Array.from(latestByPair.values())) {
    const currentVersion = await currentVersionFor(
      supabase,
      row.source_type as SourceType,
      row.source_id
    );
    if (currentVersion === null || currentVersion > row.source_version) {
      stale.push({
        asset_type: row.asset_type as AssetType,
        asset_id: row.asset_id,
        source_type: row.source_type as SourceType,
        source_id: row.source_id,
        source_version: row.source_version,
        current_version: currentVersion,
        relationship: row.relationship,
        is_missing_source: currentVersion === null,
      });
    }
  }

  const byAssetType: Partial<Record<AssetType, StaleAsset[]>> = {};
  for (const item of stale) {
    if (!byAssetType[item.asset_type]) byAssetType[item.asset_type] = [];
    byAssetType[item.asset_type]!.push(item);
  }

  return {
    available: true,
    stale,
    by_asset_type: byAssetType,
    summary: {
      stale_count: stale.length,
      checked_count: latestByPair.size,
    },
  };
}
