-- ============================================================================
-- FableKeeper — Phase 1 schema
-- Profiles, campaigns, membership/roles, and the World Builder foundation.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- fuzzy / trigram search

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.campaign_role as enum (
  'owner',
  'game_master',
  'assistant_gm',
  'player',
  'viewer'
);

create type public.world_entry_type as enum (
  'world', 'continent', 'region', 'nation', 'kingdom', 'province',
  'city', 'village', 'landmark', 'dungeon', 'ruin', 'organization',
  'noble_house', 'guild', 'religion', 'pantheon', 'culture', 'language',
  'historical_event', 'npc', 'monster', 'item', 'book', 'note', 'article'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  slug        text not null,
  description text,
  system      text not null default 'pf2e',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, slug)
);

create index campaigns_owner_id_idx on public.campaigns (owner_id);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- campaign_members — a user's role within a campaign
-- ---------------------------------------------------------------------------
create table public.campaign_members (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.campaign_role not null default 'player',
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index campaign_members_user_id_idx on public.campaign_members (user_id);
create index campaign_members_campaign_id_idx on public.campaign_members (campaign_id);

-- The campaign owner is always a member with the 'owner' role.
create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (campaign_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger campaigns_add_owner_membership
  after insert on public.campaigns
  for each row execute function public.add_owner_membership();

-- ---------------------------------------------------------------------------
-- campaign_invites — pending invitations by email
-- ---------------------------------------------------------------------------
create table public.campaign_invites (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  email       text not null,
  role        public.campaign_role not null default 'player',
  token       uuid not null default gen_random_uuid(),
  invited_by  uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (campaign_id, email)
);

create index campaign_invites_token_idx on public.campaign_invites (token);

-- ---------------------------------------------------------------------------
-- worlds — a campaign may contain one or more worlds
-- ---------------------------------------------------------------------------
create table public.worlds (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  slug        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (campaign_id, slug)
);

create index worlds_campaign_id_idx on public.worlds (campaign_id);

create trigger worlds_set_updated_at
  before update on public.worlds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- world_entries — the wiki / World Builder documents
-- ---------------------------------------------------------------------------
create table public.world_entries (
  id          uuid primary key default gen_random_uuid(),
  world_id    uuid not null references public.worlds (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  type        public.world_entry_type not null default 'article',
  title       text not null check (char_length(title) between 1 and 200),
  slug        text not null,
  summary     text,
  content     jsonb not null default '{}'::jsonb,
  is_secret   boolean not null default false,
  tags        text[] not null default '{}',
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (world_id, slug)
);

create index world_entries_world_id_idx on public.world_entries (world_id);
create index world_entries_campaign_id_idx on public.world_entries (campaign_id);
create index world_entries_type_idx on public.world_entries (type);
create index world_entries_tags_idx on public.world_entries using gin (tags);
-- Trigram index powers fuzzy title search (Phase 2 global search).
create index world_entries_title_trgm_idx
  on public.world_entries using gin (title gin_trgm_ops);

create trigger world_entries_set_updated_at
  before update on public.world_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- entry_links — Obsidian-style backlinks between entries
-- ---------------------------------------------------------------------------
create table public.entry_links (
  id              uuid primary key default gen_random_uuid(),
  source_entry_id uuid not null references public.world_entries (id) on delete cascade,
  target_entry_id uuid not null references public.world_entries (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (source_entry_id, target_entry_id),
  check (source_entry_id <> target_entry_id)
);

create index entry_links_source_idx on public.entry_links (source_entry_id);
create index entry_links_target_idx on public.entry_links (target_entry_id);
