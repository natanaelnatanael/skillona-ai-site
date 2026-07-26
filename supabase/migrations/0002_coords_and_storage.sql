-- ============================================================
-- Skillona Globe — migration 0002
-- 1) Plain latitude/longitude columns (auto-computed from the
--    PostGIS location) so the frontend can read coordinates directly
-- 2) Storage policies: signed-in users can upload photos into
--    their own folder of the public `listing-photos` bucket
-- ============================================================

alter table public.listings
  add column if not exists latitude double precision
    generated always as (st_y(location::geometry)) stored,
  add column if not exists longitude double precision
    generated always as (st_x(location::geometry)) stored;

-- Storage: allow authenticated users to upload into listing-photos/<their-user-id>/...
create policy "upload own listing photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "delete own listing photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
