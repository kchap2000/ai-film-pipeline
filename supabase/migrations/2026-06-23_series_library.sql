-- ============================================================
-- Migration: Series-level asset library (Track C1) — 2026-06-23
-- Additive + non-breaking. Existing per-project projects have series_id NULL
-- and are unaffected. Apply in the Supabase SQL editor (project onavhfhpdxwzdwotkddq).
-- RLS stays DISABLED to match every sibling table (auth-stub era).
-- ============================================================

create table if not exists series (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid,                       -- nullable: matches the auth-stub reality
  title text not null,
  bible_text text,                    -- optional shared series bible
  setting_profile jsonb,              -- era / wardrobe rules inherited by every episode
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- An episode/project optionally belongs to a series.
alter table projects add column if not exists series_id uuid references series(id) on delete set null;
alter table projects add column if not exists episode_number integer;
create index if not exists idx_projects_series on projects(series_id);

-- project_elements becomes dual-scope. A row is SERIES-level when series_id is
-- set and project_id is null; PROJECT-level otherwise. Reusing this table (not a
-- parallel one) means the prompt registry, elements route, and versioning all
-- keep working unchanged.
alter table project_elements add column if not exists series_id uuid references series(id) on delete cascade;
alter table project_elements alter column project_id drop not null;
alter table project_elements
  add constraint project_elements_scope_chk
  check ( (project_id is not null and series_id is null)
       or (project_id is null     and series_id is not null) );

-- Series can't have two active elements of the same kind+name.
create unique index if not exists idx_series_elements_active_unique
  on project_elements(series_id, kind, name) where active and series_id is not null;

-- Characters & locations get an inheritance pointer to a canonical series element.
-- When set, the prompt registry resolves identity from the series element and the
-- pipeline SKIPS casting/scouting/element-creation for that entity.
alter table characters add column if not exists series_element_id uuid references project_elements(id) on delete set null;
alter table locations  add column if not exists series_element_id uuid references project_elements(id) on delete set null;
