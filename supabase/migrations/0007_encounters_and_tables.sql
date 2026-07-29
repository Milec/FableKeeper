-- ============================================================================
-- FableKeeper — Phase 5 schema
-- Saved encounters and custom rollable tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- encounters — a saved, reusable PF2E encounter
-- ---------------------------------------------------------------------------
create table public.encounters (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  party_size    integer not null default 4 check (party_size between 1 and 12),
  party_level   integer not null default 1 check (party_level between 1 and 20),
  target_threat text not null default 'moderate',
  -- Array of combatant objects: {name, level, count, kind, adjustment}.
  combatants    jsonb not null default '[]'::jsonb,
  notes         text,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index encounters_campaign_id_idx on public.encounters (campaign_id);

create trigger encounters_set_updated_at
  before update on public.encounters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- roll_tables — custom rollable tables (Foundry-style)
-- ---------------------------------------------------------------------------
create table public.roll_tables (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  description text,
  folder      text,
  tags        text[] not null default '{}',
  -- Array of {weight:int, text:string} entries.
  entries     jsonb not null default '[]'::jsonb,
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index roll_tables_campaign_id_idx on public.roll_tables (campaign_id);
create index roll_tables_tags_idx on public.roll_tables using gin (tags);

create trigger roll_tables_set_updated_at
  before update on public.roll_tables
  for each row execute function public.set_updated_at();
