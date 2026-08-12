-- ============================================================
--  MARMEE — MOM SIGN-UP TRIGGER  (run once)
--  When a mom signs up, this builds her profile record from the
--  details her app sends along. Works whether or not email
--  confirmation is on. Paste into the SQL Editor and Run.
-- ============================================================

create or replace function handle_new_mom()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  d jsonb := new.raw_user_meta_data;
  new_mom_id uuid;
  ref jsonb;
begin
  -- only act when the sign-up says this is a mom
  if d is null or coalesce(d->>'role','') <> 'mom' then
    return new;
  end if;

  insert into moms (
    user_id, first_name, last_initial, neighborhood, experience, bio,
    areas, days_available, times_available, travel_radius, drives,
    supplies_pref, stairs_ok, phone, status, vetting_stage, bg_check_status
  ) values (
    new.id,
    d->>'first_name', d->>'last_initial', d->>'neighborhood', d->>'experience', d->>'bio',
    coalesce((select array_agg(x) from jsonb_array_elements_text(d->'areas') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(d->'days')  x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(d->'times') x), '{}'),
    d->>'travel',
    case when d->>'drives' = 'true' then true
         when d->>'drives' = 'false' then false
         else null end,
    d->>'supplies', d->>'stairs_ok', d->>'phone', 'new', 0, 'pending'
  )
  returning id into new_mom_id;

  insert into profiles (id, role) values (new.id, 'mom')
    on conflict (id) do nothing;

  if d ? 'references' then
    for ref in select * from jsonb_array_elements(d->'references')
    loop
      if coalesce(ref->>'name','') <> '' or coalesce(ref->>'contact','') <> '' then
        insert into mom_references (mom_id, name, relationship, contact)
        values (new_mom_id, ref->>'name', ref->>'relationship', ref->>'contact');
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_mom on auth.users;
create trigger on_auth_user_created_mom
  after insert on auth.users
  for each row execute function handle_new_mom();
