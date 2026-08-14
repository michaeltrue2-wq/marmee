-- ============================================================
--  MARMEE — GOOGLE SIGN-IN
--
--  Sign-up currently packs every answer into raw_user_meta_data and a
--  trigger builds the record when the account is created. Google sign-in
--  cannot work that way: the account already exists by the time she comes
--  back, so no insert trigger fires and there is no metadata to read.
--
--  These two functions do what the triggers do, but on demand and for the
--  person who is already signed in. They are also the only way the app can
--  create a `profiles` row at all — writes to that table were revoked from
--  `authenticated` when we closed the operator-escalation hole.
--
--  Both are idempotent: calling twice returns the existing record rather
--  than making a second one. A half-finished sign-up that gets retried
--  must not leave two Marms called Ruth.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

create or replace function claim_marm(d jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid; mkt uuid; ref jsonb;
begin
  if uid is null then raise exception 'Not signed in.'; end if;

  select id into new_id from moms where user_id = uid;
  if new_id is not null then return new_id; end if;

  if exists (select 1 from profiles where id = uid and role <> 'mom') then
    raise exception 'That account is already set up on the other side of Marmee.';
  end if;

  mkt := coalesce(market_for_zip(nullif(d->>'zip','')), nullif(d->>'market_id','')::uuid);

  insert into moms (
    user_id, first_name, last_initial, neighborhood, experience, bio,
    areas, days_available, times_available, travel_radius, drives,
    supplies_pref, stairs_ok, phone, zip, market_id, lat, lng,
    status, vetting_stage, bg_check_status
  ) values (
    uid, d->>'first_name', d->>'last_initial', d->>'neighborhood',
    d->>'experience', d->>'bio',
    coalesce((select array_agg(x) from jsonb_array_elements_text(d->'areas') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(d->'days')  x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(d->'times') x), '{}'),
    d->>'travel',
    case when d->>'drives' = 'true' then true
         when d->>'drives' = 'false' then false else null end,
    d->>'supplies', d->>'stairs_ok', d->>'phone',
    nullif(d->>'zip',''), mkt,
    nullif(d->>'lat','')::numeric, nullif(d->>'lng','')::numeric,
    'new', 0, 'pending'
  ) returning id into new_id;

  insert into profiles (id, role) values (uid, 'mom') on conflict (id) do nothing;

  if d ? 'references' then
    for ref in select * from jsonb_array_elements(d->'references') loop
      if coalesce(ref->>'name','') <> '' or coalesce(ref->>'contact','') <> '' then
        insert into mom_references (mom_id, name, relationship, contact)
        values (new_id, ref->>'name', ref->>'relationship', ref->>'contact');
      end if;
    end loop;
  end if;

  return new_id;
end $$;


create or replace function claim_household(d jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid; mkt uuid; r jsonb;
begin
  if uid is null then raise exception 'Not signed in.'; end if;

  select id into new_id from families where user_id = uid;
  if new_id is not null then return new_id; end if;

  if exists (select 1 from profiles where id = uid and role <> 'family') then
    raise exception 'That account is already set up on the other side of Marmee.';
  end if;

  mkt := coalesce(market_for_zip(nullif(d->>'zip','')), nullif(d->>'market_id','')::uuid);

  insert into families (
    user_id, name, neighborhood, household, home_type, stairs,
    zip, market_id, lat, lng, contact_email, status, joined_at
  ) values (
    uid, d->>'name', d->>'neighborhood', d->>'household',
    d->>'home_type', d->>'stairs',
    nullif(d->>'zip',''), mkt,
    nullif(d->>'lat','')::numeric, nullif(d->>'lng','')::numeric,
    (select email from auth.users where id = uid),
    'active', current_date
  ) returning id into new_id;

  insert into profiles (id, role) values (uid, 'family') on conflict (id) do nothing;

  r := d->'request';
  if r is not null then
    insert into requests (family_id, areas, frequency, preferred_window, status)
    values (new_id,
      coalesce((select array_agg(x) from jsonb_array_elements_text(r->'areas') x), '{}'),
      r->>'frequency', r->>'window', 'open');
  end if;

  return new_id;
end $$;

revoke all on function claim_marm(jsonb), claim_household(jsonb) from anon;
grant execute on function claim_marm(jsonb), claim_household(jsonb) to authenticated;

select proname, prosecdef as security_definer
from pg_proc where proname in ('claim_marm','claim_household');
