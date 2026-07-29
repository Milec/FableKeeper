-- ============================================================================
-- FableKeeper — security hardening (addresses database linter warnings)
-- ============================================================================

-- 1. Pin the search_path on the one trigger function that lacked it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Trigger functions are invoked by triggers, never meant to be called as
--    PostgREST RPCs. Triggers bypass EXECUTE checks, so revoking is safe and
--    removes them from the exposed API surface.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_owner_membership() from public, anon, authenticated;

-- 3. The RLS helper functions must stay executable by `authenticated` (RLS
--    policies call them), but `anon` never needs them since every policy is
--    scoped `to authenticated`. Revoke anon to shrink the surface. These
--    functions only ever reveal the CALLER's own membership (via auth.uid()),
--    so the remaining `authenticated` exposure is intentional and leaks nothing
--    a user cannot already determine about themselves.
revoke execute on function public.campaign_role(uuid) from public, anon;
revoke execute on function public.is_campaign_member(uuid) from public, anon;
revoke execute on function public.can_edit_campaign(uuid) from public, anon;
revoke execute on function public.can_view_secrets(uuid) from public, anon;

-- 4. Move the pg_trgm extension out of the public schema. Existing indexes
--    continue to work (they store the opclass OID), and the `extensions`
--    schema is on the default search_path for future trigram indexes.
alter extension pg_trgm set schema extensions;
