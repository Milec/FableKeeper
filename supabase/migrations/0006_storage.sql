-- ============================================================================
-- FableKeeper — media storage (character portraits, entry images, handouts)
-- ============================================================================
-- A single bucket holds all campaign media. Objects are keyed by campaign:
--   {campaignId}/{kind}/{uuid}.{ext}
-- so the campaign id is always the first path segment. Read is public (the
-- paths are unguessable UUIDs, matching how VTTs serve portraits/maps), while
-- WRITE and DELETE are restricted by campaign membership via RLS on
-- storage.objects. Nothing that requires secrecy (secret lore, GM notes) is a
-- binary asset — those live in RLS-protected tables — so public read is an
-- acceptable, simple choice for images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Helper: the campaign id encoded as the first folder of an object name.
-- Returns null when the first segment is not a valid uuid (so policies deny).
create or replace function public.media_campaign_id(object_name text)
returns uuid
language plpgsql
immutable
security invoker set search_path = ''
as $$
begin
  return (split_part(object_name, '/', 1))::uuid;
exception
  when others then
    return null;
end;
$$;

-- Members of the campaign encoded in the path may upload.
create policy "Members can upload campaign media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and public.is_campaign_member(public.media_campaign_id(name))
  );

-- Editors (or the original uploader) may replace an object.
create policy "Editors or uploaders can update campaign media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (
      owner = auth.uid()
      or public.can_edit_campaign(public.media_campaign_id(name))
    )
  );

-- Editors (or the original uploader) may delete an object.
create policy "Editors or uploaders can delete campaign media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (
      owner = auth.uid()
      or public.can_edit_campaign(public.media_campaign_id(name))
    )
  );
