-- ---------------------------------------------------------------------------
-- 0010 — interactive maps
--
-- A map is an image plus a set of pins. Pins carry **normalised** coordinates
-- (0–1 of the image's width/height) rather than pixels, so the same pin data
-- works whichever resolution the GM exported their map image at — Azgaar will
-- happily give you 1680×849 or 8000×4045 for the same world.
--
-- Fog of war is per pin: `is_revealed` gates whether players see it at all. The
-- GM's own view always shows everything, which is why the select policy splits
-- on `can_edit_campaign`.
-- ---------------------------------------------------------------------------

create table public.maps (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  world_id    uuid references public.worlds (id) on delete set null,
  name        text not null,
  description text,
  image_url   text,
  -- Source metadata, e.g. {"source":"azgaar","version":"1.112.1","seed":"…"}.
  source      jsonb not null default '{}'::jsonb,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index maps_campaign_idx on public.maps (campaign_id);

create trigger maps_set_updated_at
  before update on public.maps
  for each row execute function public.set_updated_at();

create table public.map_pins (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references public.maps (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- The world article this pin opens, when it has one.
  entry_id    uuid references public.world_entries (id) on delete set null,
  label       text not null,
  -- Free-form category driving the pin icon, e.g. 'city', 'ruin', 'volcanoes'.
  kind        text not null default 'landmark',
  -- Fractions of the image's width and height, both 0–1.
  x           double precision not null,
  y           double precision not null,
  is_revealed boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint map_pins_x_range check (x >= 0 and x <= 1),
  constraint map_pins_y_range check (y >= 0 and y <= 1)
);

create index map_pins_map_idx on public.map_pins (map_id);
create index map_pins_entry_idx on public.map_pins (entry_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.maps enable row level security;
alter table public.map_pins enable row level security;

create policy "Members can view campaign maps"
  on public.maps for select
  using (public.is_campaign_member(campaign_id));

create policy "Editors can create maps"
  on public.maps for insert
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can update maps"
  on public.maps for update
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete maps"
  on public.maps for delete
  using (public.can_edit_campaign(campaign_id));

-- Players see only revealed pins; GMs see every pin so they can reveal them.
create policy "Members can view revealed pins"
  on public.map_pins for select
  using (
    public.is_campaign_member(campaign_id)
    and (is_revealed or public.can_edit_campaign(campaign_id))
  );

create policy "Editors can create pins"
  on public.map_pins for insert
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can update pins"
  on public.map_pins for update
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete pins"
  on public.map_pins for delete
  using (public.can_edit_campaign(campaign_id));
