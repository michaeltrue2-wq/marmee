-- ============================================================
--  MARMEE — PHOTOS
--
--  Adds:
--    · a private `photos` bucket, with access rules
--    · avatar_path on moms and families
--
--  The access rule that matters: a Mom's photos are visible to the Marm
--  she is MATCHED with, and to operators. Not to Marms in general, and
--  never to the public. The bucket is private — files are only reachable
--  through a signed URL, and the signature is only issued to someone the
--  policy below already allows.
--
--  Paste the whole file into the SQL Editor and Run. Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  1) Columns
-- ------------------------------------------------------------
alter table moms     add column if not exists avatar_path text;
alter table families add column if not exists avatar_path text;



-- ------------------------------------------------------------
--  2) The bucket — private
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;


-- ------------------------------------------------------------
--  3) Who owns a path
--     Paths look like:  families/<family_id>/home-1.jpg
--                       moms/<mom_id>/avatar.jpg
--     Compared as text, not cast to uuid — a malformed path should
--     return false, not raise.
-- ------------------------------------------------------------
create or replace function owns_photo_path(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case (storage.foldername(path))[1]
    when 'moms'     then (storage.foldername(path))[2] = my_mom_id()::text
    when 'families' then (storage.foldername(path))[2] = my_family_id()::text
    else false
  end
$$;


-- ------------------------------------------------------------
--  4) Who may look
--     Owner, operator, or the person on the other side of a match.
-- ------------------------------------------------------------
create or replace function can_see_photo(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    is_operator()
    or owns_photo_path(path)
    -- a Marm may see the households she is matched to
    or (
      (storage.foldername(path))[1] = 'families'
      and (storage.foldername(path))[2] in (
        select family_id::text from visits  where mom_id = my_mom_id()
        union
        select family_id::text from matches where mom_id = my_mom_id()
      )
    )
    -- a Mom may see the Marm she is matched with
    or (
      (storage.foldername(path))[1] = 'moms'
      and (storage.foldername(path))[2] in (
        select id::text from family_mom_ids() as id
      )
    )
$$;


-- ------------------------------------------------------------
--  5) Policies on the bucket
-- ------------------------------------------------------------
drop policy if exists "photos read"   on storage.objects;
drop policy if exists "photos insert" on storage.objects;
drop policy if exists "photos update" on storage.objects;
drop policy if exists "photos delete" on storage.objects;

create policy "photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and can_see_photo(name));

create policy "photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and owns_photo_path(name));

create policy "photos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and owns_photo_path(name));

create policy "photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (owns_photo_path(name) or is_operator()));


-- ------------------------------------------------------------
--  6) CHECK
-- ------------------------------------------------------------
select 'bucket' as what, id as detail from storage.buckets where id = 'photos'
union all
select 'policy', policyname from pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'photos%'
union all
select 'column', table_name || '.' || column_name from information_schema.columns
  where (table_name in ('moms','families')) and column_name = 'avatar_path'
order by 1, 2;
