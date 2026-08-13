-- ============================================================
--  MARMEE — MESSAGES: access rules, unread state, oversight
--
--  The `messages` table already exists and both apps already talk to
--  it. What it has never had is a set of access rules. Until this runs,
--  either nobody can send (RLS on with no policy — and the send button
--  swallows the error, so it just appears to do nothing) or anybody can
--  read everything (RLS off). Neither is acceptable for a table holding
--  private conversations between a woman and the household she works in.
--
--  Decisions baked in here:
--
--   * An operator can read every conversation. Marmee places people in
--     homes with children; after a complaint you need to be able to look.
--     Both apps say so on screen — see the copy in the chat header.
--
--   * You can only message someone you are actually paired with. Without
--     this any signed-in Marm could message any household in the system.
--
--   * Nobody can edit or delete a message, including their own. Only the
--     two "read" columns are writable, and that is enforced with column
--     grants rather than a policy, so a future policy cannot loosen it.
--     A conversation you may have to review after an incident is worth
--     nothing if either party can rewrite it first.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

-- ---- 1) State the apps need ---------------------------------------
alter table messages add column if not exists read_by_mom    timestamptz;
alter table messages add column if not exists read_by_family timestamptz;
-- When the notification email went out. Null means "still owed one",
-- which is what the digest job looks for.
alter table messages add column if not exists notified_at    timestamptz;

create index if not exists messages_pair_idx   on messages(family_id, mom_id, created_at);
create index if not exists messages_unsent_idx on messages(created_at) where notified_at is null;

-- ---- 2) Are these two actually working together? -------------------
create or replace function is_paired(p_mom uuid, p_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits  where mom_id = p_mom and family_id = p_family)
      or exists (select 1 from matches where mom_id = p_mom and family_id = p_family)
$$;

-- ---- 3) Who can see what -------------------------------------------
alter table messages enable row level security;

drop policy if exists "messages read" on messages;
create policy "messages read" on messages
  for select to authenticated
  using (is_operator() or mom_id = my_mom_id() or family_id = my_family_id());

-- The sender_role must match who you actually are. Otherwise a Mom could
-- post a message that renders as though her Marm wrote it.
drop policy if exists "messages send" on messages;
create policy "messages send" on messages
  for insert to authenticated
  with check (
    is_paired(mom_id, family_id)
    and (
         (sender_role = 'mom'      and mom_id    = my_mom_id())
      or (sender_role = 'family'   and family_id = my_family_id())
      or (sender_role = 'operator' and is_operator())
    )
  );

drop policy if exists "messages mark read" on messages;
create policy "messages mark read" on messages
  for update to authenticated
  using      (is_operator() or mom_id = my_mom_id() or family_id = my_family_id())
  with check (is_operator() or mom_id = my_mom_id() or family_id = my_family_id());

-- ---- 4) The history is not editable --------------------------------
-- The policy above would otherwise permit rewriting `body`. Column grants
-- are stronger than any policy: what is not granted cannot be written,
-- whatever a future policy says.
revoke update, delete on messages from authenticated;
revoke update, delete on messages from anon;
grant  update (read_by_mom, read_by_family) on messages to authenticated;

-- ---- Confirm --------------------------------------------------------
select policyname, cmd from pg_policies
where tablename = 'messages' order by policyname;
