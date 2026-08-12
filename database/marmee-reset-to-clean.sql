-- ============================================================
--  MARMEE — RESET TO A CLEAN SLATE
--
--  Keeps exactly:
--    · Diane True             (michaeltrue2@gmail.com)
--    · mike@hiremarmee.com    (operator)
--    · console@hiremarmee.com (operator)
--
--  Deletes everything else: all households, all other Marms, every
--  request / match / visit / message, and the test logins.
--
--  Every statement is guarded, so a table that doesn't exist in your
--  project is skipped instead of aborting the whole script.
--
--  HOW TO RUN: paste the whole file, hit Run, read the output at the end.
--  THIS CANNOT BE UNDONE.
-- ============================================================

do $$
declare
  keep_email constant text := 'michaeltrue2@gmail.com';
  drop_logins constant text[] := array[
    'marm@hiremarmee.com',
    'family@hiremarmee.com',
    'mike1@test.com',
    'mom1@test.com'
  ];
  n bigint;
begin

  -- 1) child records first, deepest first
  if to_regclass('public.reviews') is not null then
    execute 'delete from reviews';
    get diagnostics n = row_count; raise notice 'reviews: % deleted', n;
  else raise notice 'reviews: table not present, skipped'; end if;

  if to_regclass('public.visit_tasks') is not null then
    execute 'delete from visit_tasks';
    get diagnostics n = row_count; raise notice 'visit_tasks: % deleted', n;
  else raise notice 'visit_tasks: table not present, skipped'; end if;

  if to_regclass('public.messages') is not null then
    execute 'delete from messages';
    get diagnostics n = row_count; raise notice 'messages: % deleted', n;
  else raise notice 'messages: table not present, skipped'; end if;

  if to_regclass('public.visits') is not null then
    execute 'delete from visits';
    get diagnostics n = row_count; raise notice 'visits: % deleted', n;
  end if;

  if to_regclass('public.matches') is not null then
    execute 'delete from matches';
    get diagnostics n = row_count; raise notice 'matches: % deleted', n;
  end if;

  if to_regclass('public.requests') is not null then
    execute 'delete from requests';
    get diagnostics n = row_count; raise notice 'requests: % deleted', n;
  end if;

  -- 2) every household
  if to_regclass('public.families') is not null then
    execute 'delete from families';
    get diagnostics n = row_count; raise notice 'families: % deleted', n;
  end if;

  -- 3) every Marm except Diane
  if to_regclass('public.mom_references') is not null then
    execute format($f$
      delete from mom_references where mom_id in (
        select m.id from moms m
        left join auth.users u on u.id = m.user_id
        where u.email is null or lower(u.email) <> %L )
    $f$, keep_email);
    get diagnostics n = row_count; raise notice 'mom_references: % deleted', n;
  end if;

  if to_regclass('public.moms') is not null then
    execute format($f$
      delete from moms where id in (
        select m.id from moms m
        left join auth.users u on u.id = m.user_id
        where u.email is null or lower(u.email) <> %L )
    $f$, keep_email);
    get diagnostics n = row_count; raise notice 'moms: % deleted', n;
  end if;

  -- 4) retire the test logins (profiles cascades on delete)
  if to_regclass('public.profiles') is not null then
    execute format('delete from profiles where id in (select id from auth.users where lower(email) = any(%L))', drop_logins);
    get diagnostics n = row_count; raise notice 'profiles: % deleted', n;
  end if;

  execute format('delete from auth.users where lower(email) = any(%L)', drop_logins);
  get diagnostics n = row_count; raise notice 'auth.users: % deleted', n;

  raise notice '--- reset complete ---';
end $$;


-- ------------------------------------------------------------
--  What is left
-- ------------------------------------------------------------
select 'moms' as tbl, count(*) from moms
union all select 'mom_references', count(*) from mom_references
union all select 'families',       count(*) from families
union all select 'requests',       count(*) from requests
union all select 'matches',        count(*) from matches
union all select 'visits',         count(*) from visits
union all select 'auth.users',     count(*) from auth.users
order by 1;

select u.email,
       p.role,
       case when m.id is not null then 'Marm: ' || m.first_name || ' — ' || m.status
            when f.id is not null then 'Mom: '  || f.name
            when p.role = 'operator' then 'operator'
            else 'no profile row' end as what
from auth.users u
left join profiles p on p.id = u.id
left join moms     m on m.user_id = u.id
left join families f on f.user_id = u.id
order by u.created_at;
