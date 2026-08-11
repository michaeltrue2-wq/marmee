-- ============================================================
--  MARMEE — FAMILY SIGN-UP  (run once)
--  Builds a family's record + their first request from sign-up,
--  and lets a family see the mom matched to them.
-- ============================================================

-- 1) When a family signs up, create their record, profile, and first request
create or replace function handle_new_family()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := new.raw_user_meta_data; new_family_id uuid; r jsonb;
begin
  if d is null or coalesce(d->>'role','') <> 'family' then return new; end if;
  insert into families (user_id, name, neighborhood, household, status, joined_at)
  values (new.id, d->>'name', d->>'neighborhood', d->>'household', 'active', current_date)
  returning id into new_family_id;
  insert into profiles (id, role) values (new.id, 'family') on conflict (id) do nothing;
  r := d->'request';
  if r is not null then
    insert into requests (family_id, areas, frequency, preferred_window, status)
    values (new_family_id,
      coalesce((select array_agg(x) from jsonb_array_elements_text(r->'areas') x), '{}'),
      r->>'frequency', r->>'window', 'open');
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_family on auth.users;
create trigger on_auth_user_created_family after insert on auth.users
  for each row execute function handle_new_family();

-- 2) Let a family read the mom(s) matched to them (name, areas, rating)
create or replace function family_mom_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select mom_id from visits  where family_id = my_family_id()
  union
  select mom_id from matches where family_id = my_family_id()
$$;

drop policy if exists "moms family read" on moms;
create policy "moms family read" on moms for select to authenticated
  using (id in (select family_mom_ids()));
