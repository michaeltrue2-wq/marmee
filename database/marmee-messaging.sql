-- ============================================================
--  MARMEE — IN-APP MESSAGING  (run once)
--  One private thread per (family + their matched mom).
-- ============================================================
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid references families(id) on delete cascade,
  mom_id      uuid references moms(id)     on delete cascade,
  sender_role text not null check (sender_role in ('mom','family','operator')),
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table messages enable row level security;

drop policy if exists "messages operator"    on messages;
drop policy if exists "messages mom read"     on messages;
drop policy if exists "messages mom send"     on messages;
drop policy if exists "messages family read"  on messages;
drop policy if exists "messages family send"  on messages;

create policy "messages operator"   on messages for all    to authenticated using (is_operator()) with check (is_operator());
create policy "messages mom read"    on messages for select to authenticated using (mom_id = my_mom_id());
create policy "messages mom send"    on messages for insert to authenticated with check (mom_id = my_mom_id() and sender_role = 'mom');
create policy "messages family read" on messages for select to authenticated using (family_id = my_family_id());
create policy "messages family send" on messages for insert to authenticated with check (family_id = my_family_id() and sender_role = 'family');
