-- ============================================================
--  MARMEE — RESET TO A CLEAN SLATE
--
--  Removes every seeded and test record. Keeps exactly:
--    · Diane True         (the real Marm who applied — michaeltrue2@gmail.com)
--    · mike@hiremarmee.com    (operator)
--    · console@hiremarmee.com (operator)
--
--  Removes:
--    · all client households (families) and their requests, matches, visits
--    · all other Marms — Ruth M., Carol D., Nadine P., Bev L., Mom Test, Bev L
--    · the master test logins marm@ / family@ / mike1@ / mom1@
--
--  THIS DELETES DATA AND CANNOT BE UNDONE.
--  Run section 0 first and read what it tells you.
-- ============================================================


-- ------------------------------------------------------------
--  0) PREVIEW — run this on its own first
-- ------------------------------------------------------------
select 'moms — KEEPING'  as bucket, m.first_name || ' ' || coalesce(m.last_initial,'') as who, u.email
from moms m join auth.users u on u.id = m.user_id
where lower(u.email) = 'michaeltrue2@gmail.com'
union all
select 'moms — deleting', m.first_name || ' ' || coalesce(m.last_initial,''), coalesce(u.email,'(no login)')
from moms m left join auth.users u on u.id = m.user_id
where u.email is null or lower(u.email) <> 'michaeltrue2@gmail.com'
union all
select 'families — deleting', f.name, coalesce(u.email,'(no login)')
from families f left join auth.users u on u.id = f.user_id
order by 1, 2;


-- ============================================================
--  EVERYTHING BELOW DELETES. Run it once you are happy above.
-- ============================================================

-- ------------------------------------------------------------
--  1) Child records first — FKs point upward
--     visit_tasks and reviews are created outside this repo,
--     so they are guarded.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.reviews')     is not null then execute 'delete from reviews'; end if;
  if to_regclass('public.visit_tasks') is not null then execute 'delete from visit_tasks'; end if;
end $$;

delete from messages;
delete from visits;
delete from matches;
delete from requests;


-- ------------------------------------------------------------
--  2) Every household goes
-- ------------------------------------------------------------
delete from families;


-- ------------------------------------------------------------
--  3) Every Marm except Diane
-- ------------------------------------------------------------
delete from mom_references
where mom_id in (
  select m.id from moms m
  left join auth.users u on u.id = m.user_id
  where u.email is null or lower(u.email) <> 'michaeltrue2@gmail.com'
);

delete from moms
where id in (
  select m.id from moms m
  left join auth.users u on u.id = m.user_id
  where u.email is null or lower(u.email) <> 'michaeltrue2@gmail.com'
);


-- ------------------------------------------------------------
--  4) Retire the test logins.
--     Keeps the two operators and Diane. profiles cascades on
--     delete, so it clears itself.
-- ------------------------------------------------------------
delete from profiles
where id in (
  select id from auth.users
  where lower(email) in ('marm@hiremarmee.com','family@hiremarmee.com','mike1@test.com','mom1@test.com')
);

delete from auth.users
where lower(email) in ('marm@hiremarmee.com','family@hiremarmee.com','mike1@test.com','mom1@test.com');


-- ------------------------------------------------------------
--  5) CHECK — what is left
-- ------------------------------------------------------------
select 'moms'     as tbl, count(*) from moms
union all select 'mom_references', count(*) from mom_references
union all select 'families',       count(*) from families
union all select 'requests',       count(*) from requests
union all select 'matches',        count(*) from matches
union all select 'visits',         count(*) from visits
union all select 'messages',       count(*) from messages
union all select 'auth.users',     count(*) from auth.users
order by 1;

-- and who survived
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
