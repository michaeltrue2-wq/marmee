-- ============================================================
--  MARMEE — MASTER TEST ACCOUNTS  (run in the SQL Editor)
--
--  WHY THIS FILE EXISTS
--  The sign-up triggers (handle_new_mom / handle_new_family) only
--  build a profile when the sign-up carries a role in its metadata:
--      if coalesce(d->>'role','') <> 'mom' then return new; end if;
--  The dashboard's "Add user" button does NOT set that metadata, so a
--  user created there has a login but no moms/families/profiles row,
--  and the app says "We couldn't find your profile."
--
--  This file fills in what the trigger would have created.
--
--  HOW TO USE
--  STEP 1 — in the dashboard: Authentication > Users > Add user,
--           with "Auto Confirm User" ticked. Create these three:
--               marm@hiremarmee.com     (set a password you'll remember)
--               family@hiremarmee.com      (set a password you'll remember)
--               console@hiremarmee.com  (set a password you'll remember)
--  STEP 2 — paste this whole file into the SQL Editor and Run.
--  STEP 3 — log in at moms.hiremarmee.com and book.hiremarmee.com.
--
--  Safe to re-run. Nothing here deletes anything.
-- ============================================================


-- ------------------------------------------------------------
--  1) MASTER MARM  (the helper — signs in at moms.hiremarmee.com)
-- ------------------------------------------------------------
with u as (
  select id from auth.users where email = 'marm@hiremarmee.com'
)
insert into moms (
  user_id, first_name, last_initial, neighborhood, experience, bio,
  areas, days_available, times_available, travel_radius, drives,
  supplies_pref, phone, status, vetting_stage, bg_check_status
)
select
  u.id,
  'Bev', 'L',
  'Munjoy Hill',
  'Kids are grown',
  'Test account for walkthroughs and QA. Not a real Marm.',
  array['Home','Food','Errands','Keeping things on track'],
  array['Mon','Tue','Wed','Thu','Fri'],
  array['Morning','Afternoon'],
  '15 min',
  true,
  'either',
  '207-555-0100',
  'active',       -- so she appears on the Active roster, not just vetting
  4,              -- far enough along to show a completed vetting flow
  'clear'
from u
where not exists (select 1 from moms m where m.user_id = u.id);

with u as (select id from auth.users where email = 'marm@hiremarmee.com')
insert into profiles (id, role) select u.id, 'mom' from u
on conflict (id) do update set role = 'mom';


-- ------------------------------------------------------------
--  2) MASTER MOM  (the client — signs in at book.hiremarmee.com)
-- ------------------------------------------------------------
with u as (
  select id from auth.users where email = 'family@hiremarmee.com'
)
insert into families (user_id, name, neighborhood, household, status, joined_at)
select
  u.id,
  'The Wallaces',
  'West End',
  'Two kids, 4 and 7',
  'active',
  current_date
from u
where not exists (select 1 from families f where f.user_id = u.id);

with u as (select id from auth.users where email = 'family@hiremarmee.com')
insert into profiles (id, role) select u.id, 'family' from u
on conflict (id) do update set role = 'family';


-- ------------------------------------------------------------
--  3) AN OPEN REQUEST for the master Mom
--     Gives the console something to assign and the family app
--     something to display. Without this both look empty.
-- ------------------------------------------------------------
insert into requests (family_id, areas, frequency, preferred_window, status)
select f.id,
       array['Home','Food'],
       'Weekly',
       'Weekday mornings',
       'open'
from families f
join auth.users u on u.id = f.user_id
where u.email = 'family@hiremarmee.com'
  and not exists (select 1 from requests r where r.family_id = f.id);


-- ------------------------------------------------------------
--  4) MASTER CONSOLE OPERATOR
--     Add your sister's address to this list when she has one.
--     profiles cascades on delete, so re-run this if you ever
--     delete and recreate an operator login.
-- ------------------------------------------------------------
insert into profiles (id, role)
  select id, 'operator' from auth.users
  where email in (
    'console@hiremarmee.com',
    'mike@hiremarmee.com'
  )
  on conflict (id) do update set role = 'operator';


-- ------------------------------------------------------------
--  5) CHECK — run this on its own to see where everyone stands
-- ------------------------------------------------------------
select
  u.email,
  u.email_confirmed_at is not null as confirmed,
  p.role,
  case
    when p.role = 'operator'  then 'OK — operator, console access only'
    when m.id is not null     then 'OK — moms row: ' || coalesce(m.first_name,'?')
    when f.id is not null     then 'OK — families row: ' || coalesce(f.name,'?')
    when u.email_confirmed_at is null
                              then 'BROKEN — never confirmed, cannot sign in'
    else 'BROKEN — no profile row, app will reject this login'
  end as profile
from auth.users u
left join profiles p on p.id = u.id
left join moms     m on m.user_id = u.id
left join families f on f.user_id = u.id
order by u.created_at;
