-- AI Film Pipeline — Phase 1 Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Project type enum
create type project_type as enum ('client', 'personal');

-- Phase status enum (maps to the 7-phase pipeline)
create type phase_status as enum (
  'ingestion',
  'extraction',
  'bible',
  'casting',
  'lock',
  'scene_bible',
  'storyboard'
);

-- Projects table
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type project_type not null default 'personal',
  client_name text,
  phase_status phase_status not null default 'ingestion',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for fast user-scoped project lookups
create index idx_projects_user_id on projects(user_id);

-- Row Level Security: users can only see/modify their own projects
alter table projects enable row level security;

create policy "Users can view their own projects"
  on projects for select
  using (auth.uid() = user_id);

create policy "Users can insert their own projects"
  on projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own projects"
  on projects for update
  using (auth.uid() = user_id);

create policy "Users can delete their own projects"
  on projects for delete
  using (auth.uid() = user_id);

-- Project files (uploaded scripts, treatments, notes)
create table project_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  file_name text not null,
  file_type text not null, -- 'application/pdf', 'text/plain', etc.
  file_size bigint not null,
  storage_path text not null, -- path in Supabase Storage
  uploaded_at timestamp with time zone default now()
);

-- Index for fast project file lookups
create index idx_project_files_project_id on project_files(project_id);

-- Auto-update updated_at on projects
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at();

-- Create storage bucket for project uploads.
-- MUST be public: the cast-headshots flow uses getPublicUrl() to render headshots
-- directly from Storage URLs (see src/app/projects/[id]/cast/page.tsx).
insert into storage.buckets (id, name, public)
values ('project-uploads', 'project-uploads', true)
on conflict (id) do update set public = true;

-- ============================================================
-- Phase 2: LLM Extraction Engine
-- ============================================================

-- Character role enum
create type character_role as enum ('lead', 'supporting', 'minor', 'extra', 'mentioned');

-- Characters table (extracted from scripts by Claude)
create table characters (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  role character_role not null default 'minor',
  personality text not null default '',
  created_at timestamp with time zone default now()
);

create index idx_characters_project_id on characters(project_id);

-- Scenes table (extracted from scripts by Claude)
create table scenes (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  scene_number integer not null,
  location text not null default '',
  time_of_day text not null default '',
  action_summary text not null default '',
  mood text not null default '',
  props text[] not null default '{}',
  wardrobe jsonb not null default '[]',
  characters_present text[] not null default '{}',
  locked boolean not null default false,
  created_at timestamp with time zone default now()
);

create index idx_scenes_project_id on scenes(project_id);

-- Extraction metadata (stores structure + logs per extraction run)
create table extractions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  structure jsonb not null default '{}',
  raw_response text,
  created_at timestamp with time zone default now()
);

create index idx_extractions_project_id on extractions(project_id);

-- ============================================================
-- Phase 4: AI Casting (Character Visualization)
-- ============================================================

-- Cast variations table (generated images per character)
create table cast_variations (
  id uuid primary key default uuid_generate_v4(),
  character_id uuid not null references characters(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  image_url text not null,
  storage_path text,
  prompt_used text not null default '',
  status text not null default 'pending', -- pending, approved, rejected
  rejection_note text,
  variation_number integer not null default 1,
  created_at timestamp with time zone default now()
);

create index idx_cast_variations_character_id on cast_variations(character_id);
create index idx_cast_variations_project_id on cast_variations(project_id);

-- Add approved_cast_id to characters (points to the chosen variation)
alter table characters add column if not exists approved_cast_id uuid references cast_variations(id);
alter table characters add column if not exists locked boolean not null default false;
-- pose_refs stores { front, three_quarter, profile } image URLs after lock
alter table characters add column if not exists pose_refs jsonb not null default '{}';

-- ============================================================
-- Phase 5: Character Lock & Reference Poses
-- ============================================================

-- Reference poses table (front, 3/4, profile per character)
create table character_poses (
  id uuid primary key default uuid_generate_v4(),
  character_id uuid not null references characters(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  pose_type text not null, -- 'front', 'three_quarter', 'profile'
  image_url text not null,
  prompt_used text not null default '',
  created_at timestamp with time zone default now()
);

create index idx_character_poses_character_id on character_poses(character_id);

-- ============================================================
-- Phase 6: Location & Scene Bible
-- ============================================================

-- Locations table (unique locations extracted from scenes)
create table locations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  time_of_day text not null default '',
  mood text not null default '',
  locked boolean not null default false,
  approved_image_url text,
  created_at timestamp with time zone default now()
);

create index idx_locations_project_id on locations(project_id);

-- Location image variations (generated by Gemini)
create table location_variations (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid not null references locations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  image_url text not null,
  prompt_used text not null default '',
  status text not null default 'pending', -- pending, approved, rejected
  rejection_note text,
  variation_number integer not null default 1,
  created_at timestamp with time zone default now()
);

create index idx_location_variations_location_id on location_variations(location_id);

-- Link scenes to locations
alter table scenes add column if not exists location_id uuid references locations(id);

-- ============================================================
-- Phase 7: Storyboard Generation
-- ============================================================

-- Storyboard panels — one panel per shot within a scene
create table storyboard_panels (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete cascade,
  panel_number integer not null default 1,
  shot_type text not null default '', -- wide, medium, close-up, OTS, POV, etc.
  camera_angle text not null default '', -- eye-level, low, high, dutch, bird's eye
  camera_movement text not null default '', -- static, pan, tilt, dolly, crane, handheld
  action_description text not null default '',
  dialogue text not null default '',
  characters_in_shot text[] not null default '{}',
  image_url text,
  prompt_used text not null default '',
  duration_seconds numeric(5,1) not null default 3.0,
  notes text not null default '',
  created_at timestamp with time zone default now()
);

create index idx_storyboard_panels_scene on storyboard_panels(scene_id);
create index idx_storyboard_panels_project on storyboard_panels(project_id);

-- ============================================================
-- Migrations: voice_only + scene_type (2026-03-29)
-- ============================================================

-- Add voice_only flag to characters (true = never physically on screen)
alter table characters add column if not exists voice_only boolean not null default false;

-- Add scene_type to scenes (real, dream, fantasy, flashback, montage)
alter table scenes add column if not exists scene_type text not null default 'real';

-- ============================================================
-- Migrations: pose_sheet_url (2026-04-03)
-- ============================================================

-- Add pose_sheet_url to characters (character reference sheet generated by Gemini)
alter table characters add column if not exists pose_sheet_url text;

-- ============================================================
-- Phase 6.5: Scene Scouting (2026-04-03)
-- ============================================================

-- Approved scout image url on each scene
alter table scenes add column if not exists approved_scout_image_url text;

-- Scene scouting variations — atmospheric/mood images per scene
create table if not exists scene_variations (
  id uuid primary key default uuid_generate_v4(),
  scene_id uuid not null references scenes(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  image_url text not null,
  prompt_used text not null default '',
  status text not null default 'pending', -- pending, approved, rejected
  rejection_note text,
  variation_number integer not null default 1,
  created_at timestamp with time zone default now()
);

create index if not exists idx_scene_variations_scene on scene_variations(scene_id);
create index if not exists idx_scene_variations_project on scene_variations(project_id);

-- ============================================================
-- Migration: Archive support (2026-04-07)
-- ============================================================

-- Soft-delete flag. archived=true hides a project from the dashboard
-- but preserves all data. Hard delete is via DELETE /api/projects/:id.
alter table projects add column if not exists archived boolean not null default false;
create index if not exists idx_projects_archived on projects(archived);

-- ============================================================
-- Migration: Phase 9 — First Frames (2026-04-15)
-- ============================================================
-- Photorealistic first-frame images per storyboard panel. Gated behind
-- storyboard completion; uses multimodal Gemini with scene-scout + per-
-- character headshot references for identity-locked output.

-- 1. New phase_status enum value (idempotent via exception handler)
do $$ begin
  alter type phase_status add value 'first_frames';
exception when duplicate_object then null; end $$;

-- 2. First frames table — one row per generated frame (keeps regen history
-- via parent_frame_id; approved frame is pointed to from storyboard_panels)
create table if not exists first_frames (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  panel_id uuid not null references storyboard_panels(id) on delete cascade,
  image_url text not null,
  prompt_used text not null,
  model_used text not null default 'gemini-3.1-flash-image-preview',
  aspect_ratio text not null default '16:9',
  status text not null default 'pending', -- pending, approved, replaced
  parent_frame_id uuid references first_frames(id) on delete set null,
  created_at timestamp with time zone default now()
);
create index if not exists idx_first_frames_project on first_frames(project_id);
create index if not exists idx_first_frames_panel on first_frames(panel_id);
create index if not exists idx_first_frames_status on first_frames(status);

-- 3. Approved-frame pointer on the panel so the UI knows which row to show.
alter table storyboard_panels
  add column if not exists approved_first_frame_id uuid
  references first_frames(id) on delete set null;

-- ============================================================
-- Migration: Production notes / style directive (2026-04-14)
-- ============================================================
-- Freeform per-project directive injected into storyboard, scene-scout, and
-- location-scout prompts so the director can lock style/continuity rules
-- (e.g. "all scenes at night", "aspect 2.39:1", "character X always in red").
alter table projects add column if not exists production_notes text not null default '';

-- ============================================================
-- Migration: Project delivery aspect ratio (2026-05-30)
-- ============================================================
-- Project-level output format for downstream visual assets. Existing projects
-- default to the legacy widescreen format; new projects can choose 9:16,
-- 16:9, 2.39:1, or 1:1 before any generations are created.
alter table projects add column if not exists aspect_ratio text not null default '16:9';
alter table location_variations add column if not exists aspect_ratio text not null default '16:9';
alter table scene_variations add column if not exists aspect_ratio text not null default '16:9';
alter table storyboard_panels add column if not exists aspect_ratio text not null default '16:9';
alter table first_frames add column if not exists aspect_ratio text not null default '16:9';

do $$ begin
  alter table projects
    add constraint projects_aspect_ratio_check
    check (aspect_ratio in ('9:16', '16:9', '2.39:1', '1:1'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table location_variations
    add constraint location_variations_aspect_ratio_check
    check (aspect_ratio in ('9:16', '16:9', '2.39:1', '1:1'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table scene_variations
    add constraint scene_variations_aspect_ratio_check
    check (aspect_ratio in ('9:16', '16:9', '2.39:1', '1:1'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table storyboard_panels
    add constraint storyboard_panels_aspect_ratio_check
    check (aspect_ratio in ('9:16', '16:9', '2.39:1', '1:1'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table first_frames
    add constraint first_frames_aspect_ratio_check
    check (aspect_ratio in ('9:16', '16:9', '2.39:1', '1:1'));
exception when duplicate_object then null; end $$;

-- ============================================================
-- Migration: Project Brain provenance + source versions (2026-05-29)
-- ============================================================
-- Version source-of-truth rows whenever canonical creative inputs change.
-- Generated assets record which source versions they used so the app can
-- identify stale downstream images after a character/location/scene edit.
alter table projects add column if not exists version integer not null default 1;
alter table characters add column if not exists version integer not null default 1;
alter table locations add column if not exists version integer not null default 1;
alter table scenes add column if not exists version integer not null default 1;
alter table storyboard_panels add column if not exists version integer not null default 1;

create table if not exists asset_provenance (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  asset_type text not null,
  asset_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  source_version integer not null default 1,
  relationship text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now()
);

create index if not exists idx_asset_provenance_project on asset_provenance(project_id);
create index if not exists idx_asset_provenance_asset on asset_provenance(asset_type, asset_id);
create index if not exists idx_asset_provenance_source on asset_provenance(source_type, source_id);

-- ============================================================
-- Migration: Backfill project ownership column for collaboration
-- ============================================================
-- Existing preview data was created before auth-owned projects were enforced.
-- Keep the column nullable so anonymous/internal preview flows continue to work.
alter table projects
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_projects_user_id on projects(user_id);

-- ============================================================
-- Migration: Collaborators, review decisions, and workflow activity
-- ============================================================
-- Project collaborators support client/reviewer portals before strict RLS is
-- fully enforced in the app. Invitations are tokenized rows; once a user logs
-- in with the invited email, the row can be marked active and linked to them.
create table if not exists project_collaborators (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  role text not null default 'reviewer',
  status text not null default 'pending',
  invite_token text not null default uuid_generate_v4()::text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamp with time zone default now(),
  accepted_at timestamp with time zone,
  last_accessed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists idx_project_collaborators_project_email
  on project_collaborators(project_id, email);
create index if not exists idx_project_collaborators_project on project_collaborators(project_id);
create index if not exists idx_project_collaborators_user on project_collaborators(user_id);
create index if not exists idx_project_collaborators_token on project_collaborators(invite_token);

do $$ begin
  alter table project_collaborators
    add constraint project_collaborators_role_check
    check (role in ('owner', 'producer', 'client', 'reviewer'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_collaborators
    add constraint project_collaborators_status_check
    check (status in ('pending', 'active', 'removed'));
exception when duplicate_object then null; end $$;

create table if not exists project_decisions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  decision_type text not null,
  subject_type text not null,
  subject_id uuid not null,
  status text not null default 'approved',
  notes text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_email text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now()
);

create index if not exists idx_project_decisions_project on project_decisions(project_id);
create index if not exists idx_project_decisions_subject on project_decisions(subject_type, subject_id);
create index if not exists idx_project_decisions_type on project_decisions(project_id, decision_type);

do $$ begin
  alter table project_decisions
    add constraint project_decisions_status_check
    check (status in ('approved', 'rejected', 'needs_changes', 'commented'));
exception when duplicate_object then null; end $$;

create table if not exists project_activity (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  activity_type text not null,
  title text not null,
  body text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now()
);

create index if not exists idx_project_activity_project_created
  on project_activity(project_id, created_at desc);

alter table project_collaborators enable row level security;
alter table project_decisions enable row level security;
alter table project_activity enable row level security;

-- Preview-mode policies for the current public/internal app. Route handlers
-- still enforce the intended workflow permissions; these keep anon-key route
-- writes working until strict authenticated access is required.
create policy "Preview can read collaborators"
  on project_collaborators for select
  using (true);

create policy "Preview can create collaborators"
  on project_collaborators for insert
  with check (true);

create policy "Preview can update collaborators"
  on project_collaborators for update
  using (true)
  with check (true);

create policy "Preview can read decisions"
  on project_decisions for select
  using (true);

create policy "Preview can create decisions"
  on project_decisions for insert
  with check (true);

create policy "Preview can read activity"
  on project_activity for select
  using (true);

create policy "Preview can create activity"
  on project_activity for insert
  with check (true);

-- ============================================================
-- Migration: Project Brain feedback and continuity rules
-- ============================================================
create table if not exists project_feedback (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  target_type text not null default 'project',
  target_id uuid,
  target_label text not null default 'Whole Project',
  phase text,
  intent text not null default 'feedback',
  priority text not null default 'important',
  status text not null default 'open',
  body text not null,
  transcript_source text not null default 'typed',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_project_feedback_project_created
  on project_feedback(project_id, created_at desc);
create index if not exists idx_project_feedback_target
  on project_feedback(project_id, target_type, target_id);
create index if not exists idx_project_feedback_status
  on project_feedback(project_id, status);

do $$ begin
  alter table project_feedback
    add constraint project_feedback_target_type_check
    check (target_type in ('project', 'character', 'cast_variation', 'pose_sheet', 'location', 'location_variation', 'scene', 'scene_variation', 'storyboard_panel', 'first_frame', 'prop', 'outfit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_feedback
    add constraint project_feedback_intent_check
    check (intent in ('feedback', 'regenerate', 'continuity_rule', 'client_comment', 'approval_blocker'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_feedback
    add constraint project_feedback_priority_check
    check (priority in ('minor', 'important', 'must_follow'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_feedback
    add constraint project_feedback_status_check
    check (status in ('open', 'applied', 'ignored', 'resolved'));
exception when duplicate_object then null; end $$;

create table if not exists project_continuity_rules (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  scope_type text not null default 'project',
  scope_id uuid,
  scope_label text not null default 'Whole Project',
  category text not null default 'continuity',
  rule_text text not null,
  strength text not null default 'important',
  status text not null default 'active',
  source_feedback_id uuid references project_feedback(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_project_continuity_project_created
  on project_continuity_rules(project_id, created_at desc);
create index if not exists idx_project_continuity_scope
  on project_continuity_rules(project_id, scope_type, scope_id);
create index if not exists idx_project_continuity_status
  on project_continuity_rules(project_id, status);

do $$ begin
  alter table project_continuity_rules
    add constraint project_continuity_scope_type_check
    check (scope_type in ('project', 'character', 'cast_variation', 'pose_sheet', 'location', 'location_variation', 'scene', 'scene_variation', 'storyboard_panel', 'first_frame', 'prop', 'outfit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_continuity_rules
    add constraint project_continuity_category_check
    check (category in ('vision', 'identity', 'wardrobe', 'props', 'location', 'lighting', 'camera', 'composition', 'performance', 'tone', 'continuity'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_continuity_rules
    add constraint project_continuity_strength_check
    check (strength in ('minor', 'important', 'must_follow'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table project_continuity_rules
    add constraint project_continuity_status_check
    check (status in ('active', 'superseded', 'archived'));
exception when duplicate_object then null; end $$;

alter table project_feedback enable row level security;
alter table project_continuity_rules enable row level security;

grant select, insert, update on project_feedback to anon, authenticated, service_role;
grant select, insert, update on project_continuity_rules to anon, authenticated, service_role;

create policy "Preview can read project feedback"
  on project_feedback for select
  using (true);

create policy "Preview can create project feedback"
  on project_feedback for insert
  with check (true);

create policy "Preview can update project feedback"
  on project_feedback for update
  using (true)
  with check (true);

create policy "Preview can read continuity rules"
  on project_continuity_rules for select
  using (true);

create policy "Preview can create continuity rules"
  on project_continuity_rules for insert
  with check (true);

create policy "Preview can update continuity rules"
  on project_continuity_rules for update
  using (true)
  with check (true);

-- ============================================================
-- Migration: Generation job queue and review history
-- ============================================================
-- Durable queue for AI work requested from Project Brain or review pages.
-- Jobs decouple client/reviewer feedback from immediate credit-spending
-- generation, and preserve retry/error/result history per target asset.
create table if not exists generation_jobs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  job_type text not null default 'first_frame_regeneration',
  action text not null default 'regenerate',
  target_type text not null default 'project',
  target_id uuid,
  target_label text not null default 'Whole Project',
  status text not null default 'queued',
  priority text not null default 'important',
  prompt text not null default '',
  source_feedback_id uuid references project_feedback(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_email text,
  started_by uuid references auth.users(id) on delete set null,
  started_by_email text,
  result_asset_type text,
  result_asset_ids uuid[] not null default '{}',
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);

create index if not exists idx_generation_jobs_project_created
  on generation_jobs(project_id, created_at desc);
create index if not exists idx_generation_jobs_target
  on generation_jobs(project_id, target_type, target_id);
create index if not exists idx_generation_jobs_status
  on generation_jobs(project_id, status);
create index if not exists idx_generation_jobs_feedback
  on generation_jobs(source_feedback_id);

do $$ begin
  alter table generation_jobs
    add constraint generation_jobs_job_type_check
    check (job_type in ('first_frame_generation', 'first_frame_regeneration', 'storyboard_generation', 'scene_scout_generation', 'location_generation', 'cast_generation', 'pose_sheet_generation', 'wardrobe_generation', 'prop_generation'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table generation_jobs
    add constraint generation_jobs_action_check
    check (action in ('generate', 'regenerate', 'replace', 'export'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table generation_jobs
    add constraint generation_jobs_target_type_check
    check (target_type in ('project', 'character', 'cast_variation', 'pose_sheet', 'location', 'location_variation', 'scene', 'scene_variation', 'storyboard_panel', 'first_frame', 'prop', 'outfit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table generation_jobs
    add constraint generation_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table generation_jobs
    add constraint generation_jobs_priority_check
    check (priority in ('minor', 'important', 'must_follow'));
exception when duplicate_object then null; end $$;

alter table generation_jobs enable row level security;

grant select, insert, update on generation_jobs to anon, authenticated, service_role;

create policy "Preview can read generation jobs"
  on generation_jobs for select
  using (true);

create policy "Preview can create generation jobs"
  on generation_jobs for insert
  with check (true);

create policy "Preview can update generation jobs"
  on generation_jobs for update
  using (true)
  with check (true);

-- ============================================================
-- Migration: Make project-uploads bucket public (2026-04-14)
-- ============================================================
-- Headshot uploads use getPublicUrl(); the bucket must be public or rendered
-- image URLs 400. Safe to re-run.
update storage.buckets set public = true where id = 'project-uploads';

-- ============================================================
-- Migration: Add user_id to existing projects (2026-04-04)
-- ============================================================
-- Run this ONLY if you already have data in the projects table.
-- Replace 'YOUR_USER_UUID' with your auth.users id after first Google login.
--
-- alter table projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- update projects set user_id = 'YOUR_USER_UUID' where user_id is null;
-- alter table projects alter column user_id set not null;
-- create index if not exists idx_projects_user_id on projects(user_id);
-- alter table projects enable row level security;
-- create policy "Users can view their own projects" on projects for select using (auth.uid() = user_id);
-- create policy "Users can insert their own projects" on projects for insert with check (auth.uid() = user_id);
-- create policy "Users can update their own projects" on projects for update using (auth.uid() = user_id);
-- create policy "Users can delete their own projects" on projects for delete using (auth.uid() = user_id);

-- ============================================================
-- Migration: FINAL VISION — modes, video pipeline, QA (2026-04-19)
-- ============================================================
-- See FINAL_VISION.md. Adds Auto/Manual mode, the auto-pipeline
-- orchestrator state, Phase 10 video clips, Phase 11 assembly,
-- and Phase 12 QA reports.

-- Project mode: 'auto' runs the full pipeline unattended,
-- 'manual' pauses at each phase gate for director review.
alter table projects add column if not exists mode text not null default 'manual';

-- Orchestrator state — one row per pipeline run. Resumable: if a run
-- fails mid-flight, POST /auto-pipeline picks up from current_step.
create table if not exists pipeline_runs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  mode text not null default 'auto',
  current_step text not null default 'extract',
  -- progress cursor for multi-item steps (e.g. which character / which variation)
  progress jsonb not null default '{}',
  status text not null default 'running', -- running, paused, completed, failed
  phase_timings jsonb not null default '{}',
  error_log jsonb not null default '[]',
  qa_loops_completed integer not null default 0,
  started_at timestamp with time zone default now(),
  completed_at timestamp with time zone
);
create index if not exists idx_pipeline_runs_project on pipeline_runs(project_id);

-- Phase 10: one row per generated video clip (regen lineage via parent_clip_id)
create table if not exists video_clips (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  panel_id uuid not null references storyboard_panels(id) on delete cascade,
  first_frame_id uuid references first_frames(id) on delete set null,
  higgsfield_job_id text,
  status text not null default 'pending', -- pending, generating, completed, failed, approved
  video_url text,
  duration_seconds numeric,
  model_used text not null default 'seedance_2_0',
  prompt_used text not null default '',
  motion_description text,
  retry_count integer not null default 0,
  parent_clip_id uuid references video_clips(id) on delete set null,
  created_at timestamp with time zone default now()
);
create index if not exists idx_video_clips_project on video_clips(project_id);
create index if not exists idx_video_clips_panel on video_clips(panel_id);
create index if not exists idx_video_clips_status on video_clips(status);

-- Phase 11: assembled scene/full videos. video_url null = manifest-only
-- assembly (sequential playback in the player); set when a stitched file
-- exists (ffmpeg local export or cloud assembler).
create table if not exists assembled_videos (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  scope text not null default 'full', -- 'scene' or 'full'
  scene_id uuid references scenes(id) on delete set null,
  video_url text,
  manifest jsonb not null default '[]', -- ordered clip list [{clip_id, video_url, duration}]
  duration_seconds numeric,
  clip_count integer not null default 0,
  status text not null default 'pending', -- pending, ready, failed
  created_at timestamp with time zone default now()
);
create index if not exists idx_assembled_videos_project on assembled_videos(project_id);

-- Phase 12: QA beat-analysis reports
create table if not exists qa_reports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  assembled_video_id uuid references assembled_videos(id) on delete set null,
  overall_score numeric,
  beat_accuracy jsonb not null default '[]',
  character_flags jsonb not null default '[]',
  mood_flags jsonb not null default '[]',
  regen_targets jsonb not null default '[]',
  created_at timestamp with time zone default now()
);
create index if not exists idx_qa_reports_project on qa_reports(project_id);

-- ============================================================
-- OPTIONAL CLEANUP (per FINAL_VISION.md feature-sprawl verdicts)
-- Run manually in Supabase SQL Editor when ready. The app degrades
-- gracefully when these are gone (inserts silently no-op).
-- ============================================================
-- DROP TABLE IF EXISTS wardrobe_items CASCADE;
-- DROP TABLE IF EXISTS generation_jobs CASCADE;
-- DROP TABLE IF EXISTS project_collaborators CASCADE;
-- DROP TABLE IF EXISTS project_decisions CASCADE;
-- DROP TABLE IF EXISTS project_continuity_rules CASCADE;
-- DROP TABLE IF EXISTS project_feedback CASCADE;


-- ============================================================
-- Migration: Higgsfield Elements for consistency (2026-06-10)
-- (already applied to live DB via MCP migration higgsfield_element_ids)
-- ============================================================
-- Characters and locations carry a reusable Higgsfield reference element
-- created from their approved headshot / location plate. Video prompts
-- embed <<<element_id>>> placeholders, which Higgsfield resolves to the
-- locked reference image — preventing face/wardrobe/set drift.
alter table characters add column if not exists higgsfield_element_id text;
alter table locations add column if not exists higgsfield_element_id text;

-- ============================================================
-- Migration: project_elements registry (2026-06-10)
-- (already applied to live DB via MCP migration project_elements_registry)
-- ============================================================
-- Everything that crosses scenes becomes an element (PROMPTING.md round 3):
-- recurring props (scenes.props in ≥2 scenes), recurring outfits
-- (scenes.wardrobe), environments. Characters are tracked on the
-- characters table directly. Lifecycle:
--   planned → image_ready (Gemini reference plate uploaded to the public
--   bucket) → element_ready (Higgsfield element created via MCP, id stored).
-- match_terms are swapped for <<<higgsfield_element_id>>> placeholders by
-- the prompt engine (src/lib/prompt-engine.ts).
create table if not exists project_elements (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null, -- prop, outfit, environment
  name text not null,
  match_terms text[] not null default '{}',
  description text,
  scene_numbers integer[] not null default '{}',
  ref_image_url text,
  higgsfield_element_id text,
  status text not null default 'planned', -- planned, image_ready, element_ready
  created_at timestamp with time zone default now()
);
create unique index if not exists idx_project_elements_unique
  on project_elements(project_id, kind, name);
create index if not exists idx_project_elements_project on project_elements(project_id);

-- ============================================================
-- Migration: sequence clips (2026-06-10)
-- (already applied live via MCP migration video_clips_covered_panels)
-- ============================================================
-- Multi-shot sequence clips: one Seedance generation covers up to 3
-- consecutive same-scene panels (numbered Shot 1/2/3 prompt syntax).
-- The clip row attaches to the group's head panel; the siblings it
-- absorbs are listed here so coverage/skip logic and QA regens treat
-- them as fulfilled.
alter table video_clips add column if not exists covered_panel_ids uuid[] not null default '{}';

-- ============================================================
-- Migration: script text on project (2026-06-11)
-- (already applied live via MCP migration projects_script_text)
-- ============================================================
-- The parsed script is persisted at extraction time so the storyboard
-- shot breakdown can quote dialogue VERBATIM (DramaBox-fidelity rule)
-- instead of working from 2-4 sentence scene summaries.
alter table projects add column if not exists script_text text;

-- ============================================================
-- Migration: learning system (2026-06-11)
-- (already applied live via MCP migration learning_system)
-- ============================================================
-- 1. projects.setting_profile — the world's physical rules derived at
--    extraction (era, technology level, wardrobe rules, forbidden
--    anachronisms). Injected into every generation prompt and enforced
--    by the realism gate's anachronism screen.
-- 2. pipeline_lessons — durable corrections written by QA and the gates,
--    read back into prompts on every later run. 'project' scope refines
--    this film; 'global' scope makes every future film better.
alter table projects add column if not exists setting_profile jsonb;
create table if not exists pipeline_lessons (
  id uuid primary key default uuid_generate_v4(),
  scope text not null default 'global',
  project_id uuid references projects(id) on delete cascade,
  category text not null,
  lesson text not null,
  evidence text,
  times_confirmed integer not null default 1,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
create unique index if not exists idx_lessons_unique
  on pipeline_lessons(scope, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), category, md5(lesson));
create index if not exists idx_lessons_scope on pipeline_lessons(scope, category);
