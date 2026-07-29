-- ============================================================================
-- FableKeeper — Phase 3 schema
-- Character Manager + Campaign Manager (sessions, quests).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- characters — one PF2E character sheet, owned by a user within a campaign
-- ---------------------------------------------------------------------------
create table public.characters (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  ancestry    text,
  heritage    text,
  background  text,
  class       text,
  level       integer not null default 1 check (level between 1 and 20),
  key_ability text,
  portrait_url text,
  -- {str,dex,con,int,wis,cha}
  abilities   jsonb not null default '{}'::jsonb,
  -- {ac, hp_max, hp_current, speed, class_dc, perception, ...}
  defenses    jsonb not null default '{}'::jsonb,
  -- Flexible bag for skills, feats, spells, inventory, notes, and the raw
  -- Pathbuilder payload. Kept in jsonb so PF2E data can evolve without a
  -- migration (see docs/DATABASE.md).
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index characters_campaign_id_idx on public.characters (campaign_id);
create index characters_owner_id_idx on public.characters (owner_id);

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — the session tracker / recap notes
-- ---------------------------------------------------------------------------
create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  session_date date,
  -- {markdown}
  content      jsonb not null default '{}'::jsonb,
  -- When true the whole entry is GM-only (session planning); otherwise it is a
  -- shared recap visible to all members. Mirrors the world_entries pattern.
  is_secret    boolean not null default false,
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index sessions_campaign_id_idx on public.sessions (campaign_id);
create index sessions_date_idx on public.sessions (campaign_id, session_date desc);

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quests — the quest tracker
-- ---------------------------------------------------------------------------
create type public.quest_status as enum ('active', 'completed', 'failed', 'on_hold');

create table public.quests (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  -- {markdown}
  content     jsonb not null default '{}'::jsonb,
  status      public.quest_status not null default 'active',
  is_secret   boolean not null default false,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index quests_campaign_id_idx on public.quests (campaign_id);
create index quests_status_idx on public.quests (campaign_id, status);

create trigger quests_set_updated_at
  before update on public.quests
  for each row execute function public.set_updated_at();
