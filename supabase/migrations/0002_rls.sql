-- ============================================================================
-- FableKeeper — Row Level Security
-- The role matrix here mirrors src/lib/permissions.ts. Data is protected at the
-- database layer so that even a compromised client cannot read/write beyond a
-- user's authorised scope.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Security-definer helpers. These break RLS recursion (a policy on
-- campaign_members cannot itself query campaign_members without SECURITY
-- DEFINER) and centralise membership checks.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_role(p_campaign_id uuid)
returns public.campaign_role
language sql
stable
security definer set search_path = public
as $$
  select role
  from public.campaign_members
  where campaign_id = p_campaign_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
  );
$$;

-- True when the caller may edit campaign content (owner / GM / assistant GM).
create or replace function public.can_edit_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.campaign_role(p_campaign_id)
         in ('owner', 'game_master', 'assistant_gm');
$$;

-- True when the caller may see GM-only secrets.
create or replace function public.can_view_secrets(p_campaign_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.campaign_role(p_campaign_id)
         in ('owner', 'game_master', 'assistant_gm');
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "Profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
alter table public.campaigns enable row level security;

create policy "Members can view their campaigns"
  on public.campaigns for select
  to authenticated
  using (public.is_campaign_member(id));

create policy "Users can create campaigns they own"
  on public.campaigns for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Owners can update their campaigns"
  on public.campaigns for update
  to authenticated
  using (public.campaign_role(id) = 'owner')
  with check (public.campaign_role(id) = 'owner');

create policy "Owners can delete their campaigns"
  on public.campaigns for delete
  to authenticated
  using (public.campaign_role(id) = 'owner');

-- ---------------------------------------------------------------------------
-- campaign_members
-- ---------------------------------------------------------------------------
alter table public.campaign_members enable row level security;

create policy "Members can view the roster of their campaigns"
  on public.campaign_members for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "Owners and GMs can add members"
  on public.campaign_members for insert
  to authenticated
  with check (public.campaign_role(campaign_id) in ('owner', 'game_master'));

create policy "Owners and GMs can update members"
  on public.campaign_members for update
  to authenticated
  using (public.campaign_role(campaign_id) in ('owner', 'game_master'))
  with check (public.campaign_role(campaign_id) in ('owner', 'game_master'));

-- Owners/GMs can remove members; any member may remove themselves (leave).
create policy "Owners and GMs can remove members, users can leave"
  on public.campaign_members for delete
  to authenticated
  using (
    public.campaign_role(campaign_id) in ('owner', 'game_master')
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- campaign_invites
-- ---------------------------------------------------------------------------
alter table public.campaign_invites enable row level security;

create policy "Managers can view invites"
  on public.campaign_invites for select
  to authenticated
  using (public.campaign_role(campaign_id) in ('owner', 'game_master'));

create policy "Managers can create invites"
  on public.campaign_invites for insert
  to authenticated
  with check (
    public.campaign_role(campaign_id) in ('owner', 'game_master')
    and invited_by = auth.uid()
  );

create policy "Managers can delete invites"
  on public.campaign_invites for delete
  to authenticated
  using (public.campaign_role(campaign_id) in ('owner', 'game_master'));

-- ---------------------------------------------------------------------------
-- worlds
-- ---------------------------------------------------------------------------
alter table public.worlds enable row level security;

create policy "Members can view worlds"
  on public.worlds for select
  to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "Editors can insert worlds"
  on public.worlds for insert
  to authenticated
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can update worlds"
  on public.worlds for update
  to authenticated
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete worlds"
  on public.worlds for delete
  to authenticated
  using (public.can_edit_campaign(campaign_id));

-- ---------------------------------------------------------------------------
-- world_entries — the core of "players only see what the GM reveals"
-- ---------------------------------------------------------------------------
alter table public.world_entries enable row level security;

-- Secret entries are visible only to secret-viewers; non-secret entries to any
-- campaign member.
create policy "Members can view non-secret entries; GMs can view all"
  on public.world_entries for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (not is_secret or public.can_view_secrets(campaign_id))
  );

create policy "Editors can insert entries"
  on public.world_entries for insert
  to authenticated
  with check (
    public.can_edit_campaign(campaign_id)
    and created_by = auth.uid()
  );

create policy "Editors can update entries"
  on public.world_entries for update
  to authenticated
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete entries"
  on public.world_entries for delete
  to authenticated
  using (public.can_edit_campaign(campaign_id));

-- ---------------------------------------------------------------------------
-- entry_links — visible when the source entry is visible to the caller
-- ---------------------------------------------------------------------------
alter table public.entry_links enable row level security;

create policy "Members can view links for entries they can see"
  on public.entry_links for select
  to authenticated
  using (
    exists (
      select 1 from public.world_entries e
      where e.id = source_entry_id
        and public.is_campaign_member(e.campaign_id)
        and (not e.is_secret or public.can_view_secrets(e.campaign_id))
    )
  );

create policy "Editors can manage links"
  on public.entry_links for all
  to authenticated
  using (
    exists (
      select 1 from public.world_entries e
      where e.id = source_entry_id
        and public.can_edit_campaign(e.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from public.world_entries e
      where e.id = source_entry_id
        and public.can_edit_campaign(e.campaign_id)
    )
  );
