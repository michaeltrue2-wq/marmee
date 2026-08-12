-- ============================================================
--  MARMEE — LOCK THE ROLE COLUMN   ** RUN THIS FIRST **
--
--  Verified live on 12 Aug 2026, signed in as mike@hiremarmee.com:
--
--      update profiles set role = 'mom' where id = auth.uid();
--      -> succeeded, returned {"role":"mom"}
--
--  The policy was:
--
--      create policy "profile self update" on profiles
--        for update to authenticated using (id = auth.uid());
--
--  With no WITH CHECK clause, Postgres reuses USING as the check.
--  USING only constrains `id`, so the row stays yours while `role`
--  becomes anything you like. Any signed-in Marm or Mom could open
--  the browser console and run that line — the anon key is in the
--  page source — and `is_operator()` would then return true for her.
--
--  That unlocks `for all` on moms, families, visits, matches and
--  requests: every household's address, every Marm's phone number
--  and background-check status, every card's brand and last four,
--  and the ability to charge a card.
--
--  A second door: `role` defaulted to 'operator', and the insert
--  policy checked only `id = auth.uid()`. Anyone without a profile
--  row could insert one and be an operator by default.
--
--  No app code writes to `profiles` — I grepped all three. Every
--  legitimate write goes through a SECURITY DEFINER signup trigger
--  or through this SQL editor, and neither is affected by the
--  grants below. So the fix is simply: nobody writes their own role.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

-- 1) Remove the self-service write paths.
drop policy if exists "profile self update" on profiles;
drop policy if exists "profile self insert" on profiles;

-- 2) Take the privilege away too, so a future policy cannot hand it
--    back by accident. SECURITY DEFINER triggers are unaffected —
--    they run as the function owner, not as the signed-in user.
revoke insert, update, delete on profiles from authenticated;
revoke insert, update, delete on profiles from anon;

-- 3) A row that arrives without a stated role must not become an
--    operator by omission.
alter table profiles alter column role set default 'family';

-- 4) Reading is untouched. The apps need to know their own role, and
--    "profile self read" already limits that to your own row.

-- ---- Confirm ------------------------------------------------------
-- Expect: no rows named "profile self update" or "profile self insert".
select policyname, cmd
from pg_policies
where tablename = 'profiles'
order by policyname;
