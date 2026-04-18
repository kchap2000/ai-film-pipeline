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
