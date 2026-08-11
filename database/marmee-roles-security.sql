-- ============================================================
--  MARMEE — ROLES & SECURITY  (run once)
--  This REPLACES the earlier "access rules" with proper per-person
--  security: operators see everything; a mom sees only her own data;
--  a family sees only theirs. Paste into the SQL Editor and Run.
-- ============================================================

-- 1) Link a mom/family row to the person who owns it (their login)
alter table moms     add column if not exists user_id uuid references auth.users(id);
alter table families add column if not exists user_id uuid references auth.users(id);

-- 2) A small table that records each login's role
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'operator' check (role in ('operator','mom','family')),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

-- 3) Helper checks (SECURITY DEFINER so they can read roles safely
--    without tripping the very rules they support)
create or replace function is_operator() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator')
$$;

create or replace function my_mom_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from moms where user_id = auth.uid() limit 1
$$;

create or replace function my_family_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from families where user_id = auth.uid() limit 1
$$;

-- 4) Remove the earlier "any logged-in user can do everything" rules
drop policy if exists "operators can do everything" on moms;
drop policy if exists "operators can do everything" on mom_references;
drop policy if exists "operators can do everything" on families;
drop policy if exists "operators can do everything" on requests;
drop policy if exists "operators can do everything" on matches;
drop policy if exists "operators can do everything" on visits;

-- 5) PROFILES — you manage your own row; operators can read all
create policy "profile self read"   on profiles for select to authenticated using (id = auth.uid() or is_operator());
create policy "profile self insert" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profile self update" on profiles for update to authenticated using (id = auth.uid());

-- 6) MOMS — operator: all;  a mom: her own row
create policy "moms operator"    on moms for all    to authenticated using (is_operator()) with check (is_operator());
create policy "moms self read"   on moms for select to authenticated using (user_id = auth.uid());
create policy "moms self insert" on moms for insert to authenticated with check (user_id = auth.uid());
create policy "moms self update" on moms for update to authenticated using (user_id = auth.uid());

-- 7) FAMILIES — operator: all;  a family: its own row
create policy "families operator"    on families for all    to authenticated using (is_operator()) with check (is_operator());
create policy "families self read"   on families for select to authenticated using (user_id = auth.uid());
create policy "families self insert" on families for insert to authenticated with check (user_id = auth.uid());
create policy "families self update" on families for update to authenticated using (user_id = auth.uid());

-- 8) MOM REFERENCES — operator: all;  a mom: her own references
create policy "refs operator" on mom_references for all to authenticated using (is_operator()) with check (is_operator());
create policy "refs self"     on mom_references for all to authenticated using (mom_id = my_mom_id()) with check (mom_id = my_mom_id());

-- 9) REQUESTS — operator: all;  a family: read & create its own
create policy "requests operator"     on requests for all    to authenticated using (is_operator()) with check (is_operator());
create policy "requests family read"  on requests for select to authenticated using (family_id = my_family_id());
create policy "requests family write" on requests for insert to authenticated with check (family_id = my_family_id());

-- 10) MATCHES — operator: all;  mom/family: read their own
create policy "matches operator"    on matches for all    to authenticated using (is_operator()) with check (is_operator());
create policy "matches mom read"    on matches for select to authenticated using (mom_id = my_mom_id());
create policy "matches family read" on matches for select to authenticated using (family_id = my_family_id());

-- 11) VISITS — operator: all;  mom/family: read their own
create policy "visits operator"    on visits for all    to authenticated using (is_operator()) with check (is_operator());
create policy "visits mom read"    on visits for select to authenticated using (mom_id = my_mom_id());
create policy "visits family read" on visits for select to authenticated using (family_id = my_family_id());

-- 12) Make your existing login an operator
--     (Repeat this line with your sister's email once you create her user.)
insert into profiles (id, role)
  select id, 'operator' from auth.users where email = 'mike@hiremarmee.com'
  on conflict (id) do update set role = 'operator';
