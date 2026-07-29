-- ============================================================================
-- FableKeeper — Phase 5 Row Level Security
-- Encounters and roll tables are campaign content: any member may view them,
-- editors (owner / GM / assistant GM) may manage them.
-- ============================================================================

alter table public.encounters enable row level security;

create policy "Members can view encounters"
  on public.encounters for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "Editors can insert encounters"
  on public.encounters for insert to authenticated
  with check (public.can_edit_campaign(campaign_id) and created_by = auth.uid());

create policy "Editors can update encounters"
  on public.encounters for update to authenticated
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete encounters"
  on public.encounters for delete to authenticated
  using (public.can_edit_campaign(campaign_id));

alter table public.roll_tables enable row level security;

create policy "Members can view roll tables"
  on public.roll_tables for select to authenticated
  using (public.is_campaign_member(campaign_id));

create policy "Editors can insert roll tables"
  on public.roll_tables for insert to authenticated
  with check (public.can_edit_campaign(campaign_id) and created_by = auth.uid());

create policy "Editors can update roll tables"
  on public.roll_tables for update to authenticated
  using (public.can_edit_campaign(campaign_id))
  with check (public.can_edit_campaign(campaign_id));

create policy "Editors can delete roll tables"
  on public.roll_tables for delete to authenticated
  using (public.can_edit_campaign(campaign_id));
