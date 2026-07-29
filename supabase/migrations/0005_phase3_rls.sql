-- ============================================================================
-- FableKeeper — Phase 3 Row Level Security
-- ============================================================================

-- ---------------------------------------------------------------------------
-- characters
--   * Players see and edit their own characters.
--   * Owners / GMs / Assistant GMs can see every character in the campaign.
--   * Owners / GMs can also edit/remove any character (table management).
-- ---------------------------------------------------------------------------
alter table public.characters enable row level security;

create policy "Owners see own characters; GMs see all"
  on public.characters for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.can_edit_campaign(campaign_id)
  );

create policy "Members can create their own characters"
  on public.characters for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and public.is_campaign_member(campaign_id)
  );

create policy "Owners edit own characters; managers edit any"
  on public.characters for update
  to authenticated
  using (
    owner_id = auth.uid()
    or public.campaign_role(campaign_id) in ('owner', 'game_master')
  )
  with check (
    owner_id = auth.uid()
    or public.campaign_role(campaign_id) in ('owner', 'game_master')
  );

create policy "Owners delete own characters; managers delete any"
  on public.characters for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or public.campaign_role(campaign_id) in ('owner', 'game_master')
  );

-- ---------------------------------------------------------------------------
-- sessions (same secret-visibility pattern as world_entries)
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;

create policy "Members view shared sessions; GMs view all"
  on public.sessions for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (not is_secret or public.can_view_secrets(campaign_id))
  );

create policy "Editors can insert sessions"
  on public.sessions for insert
  to authenticated
  with check (
    public.can_edit_campaign(campaign_id)
    and created_by = auth.uid()
  );

create policy "Editors can update sessions"
  on public.sessions for update
  to authenticated
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete sessions"
  on public.sessions for delete
  to authenticated
  using (public.can_edit_campaign(campaign_id));

-- ---------------------------------------------------------------------------
-- quests (same secret-visibility pattern)
-- ---------------------------------------------------------------------------
alter table public.quests enable row level security;

create policy "Members view shared quests; GMs view all"
  on public.quests for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id)
    and (not is_secret or public.can_view_secrets(campaign_id))
  );

create policy "Editors can insert quests"
  on public.quests for insert
  to authenticated
  with check (
    public.can_edit_campaign(campaign_id)
    and created_by = auth.uid()
  );

create policy "Editors can update quests"
  on public.quests for update
  to authenticated
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete quests"
  on public.quests for delete
  to authenticated
  using (public.can_edit_campaign(campaign_id));
