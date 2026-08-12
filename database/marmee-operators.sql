-- ============================================================
--  MARMEE — OPERATOR ACCESS  (audit FN-5)
--
--  THE PROBLEM
--  marmee-roles-security.sql granted the operator role to one
--  literal address:
--      select id, 'operator' from auth.users where email = 'mike@hiremarmee.com'
--  So your sister cannot reach the console without a SQL edit, and
--  there is no sign-up path for operators at all.
--
--  THE FIX
--  An allowlist table. Put an address in it and that person becomes
--  an operator — either immediately, if they already have a login,
--  or the moment they create one.
--
--  Paste into the SQL Editor and Run. Safe to re-run.
-- ============================================================


-- ------------------------------------------------------------
--  1) The allowlist
-- ------------------------------------------------------------
create table if not exists operator_emails (
  email      text primary key,
  note       text,
  added_at   timestamptz not null default now()
);
alter table operator_emails enable row level security;

-- Only existing operators can see or change the list.
drop policy if exists "operator_emails operator" on operator_emails;
create policy "operator_emails operator" on operator_emails
  for all to authenticated using (is_operator()) with check (is_operator());


-- ------------------------------------------------------------
--  2) Who gets in
--     EDIT THIS LIST. One row per person.
-- ------------------------------------------------------------
insert into operator_emails (email, note) values
  ('mike@hiremarmee.com',    'founder'),
  ('console@hiremarmee.com', 'shared test login')
  -- ('your-sister@example.com', 'operations')   <-- add her here
on conflict (email) do nothing;


-- ------------------------------------------------------------
--  3) Grant to anyone on the list who already has a login
-- ------------------------------------------------------------
insert into profiles (id, role)
  select u.id, 'operator'
  from auth.users u
  join operator_emails o on lower(o.email) = lower(u.email)
on conflict (id) do update set role = 'operator';


-- ------------------------------------------------------------
--  4) Grant automatically to anyone on the list who signs up later.
--     Runs before the mom/family triggers care, and only fires when
--     the address is allowlisted — everyone else is untouched.
-- ------------------------------------------------------------
create or replace function handle_new_operator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from operator_emails o where lower(o.email) = lower(new.email)) then
    insert into profiles (id, role) values (new.id, 'operator')
      on conflict (id) do update set role = 'operator';
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_operator on auth.users;
create trigger on_auth_user_created_operator
  after insert on auth.users
  for each row execute function handle_new_operator();


-- ------------------------------------------------------------
--  5) CHECK — who can reach the console right now
-- ------------------------------------------------------------
select
  o.email,
  o.note,
  case when u.id is null then 'no login yet — will be granted on sign-up'
       when p.role = 'operator' then 'active operator'
       else 'has a login but role is ' || coalesce(p.role,'none') || ' — re-run step 3'
  end as status
from operator_emails o
left join auth.users u on lower(u.email) = lower(o.email)
left join profiles   p on p.id = u.id
order by o.added_at;
