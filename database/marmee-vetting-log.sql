-- ============================================================
--  MARMEE — VETTING LOG
--
--  The four vetting stages were a counter. Clicking the button moved a
--  number; nothing recorded that the reference call actually happened,
--  who made it, or what was said. At three Marms you remember. At
--  fifteen you don't, and an unvetted person ends up in someone's home
--  with a green "Active" badge next to her name.
--
--  This makes each stage a record with a person and a timestamp on it,
--  and blocks activation until the background check is explicitly
--  marked clear.
-- ============================================================

create table if not exists vetting_log (
  id           uuid primary key default gen_random_uuid(),
  mom_id       uuid not null references moms(id) on delete cascade,
  stage        text not null,
  note         text,
  completed_by uuid references auth.users(id),
  completed_at timestamptz not null default now()
);

create index if not exists vetting_log_mom_idx on vetting_log(mom_id, completed_at);

alter table vetting_log enable row level security;

-- Operators write and read it. A Marm may read her own — she is entitled
-- to see what was recorded about her.
drop policy if exists "vetting_log operator" on vetting_log;
create policy "vetting_log operator" on vetting_log
  for all to authenticated using (is_operator()) with check (is_operator());

drop policy if exists "vetting_log mom read" on vetting_log;
create policy "vetting_log mom read" on vetting_log
  for select to authenticated using (mom_id = my_mom_id());

-- When the background check actually cleared, and the reference for it.
alter table moms add column if not exists bg_checked_at timestamptz;
alter table moms add column if not exists bg_reference  text;

select 'table' as what, 'vetting_log' as detail
union all select 'policy', policyname from pg_policies where tablename='vetting_log'
union all select 'column', column_name from information_schema.columns
  where table_name='moms' and column_name in ('bg_checked_at','bg_reference')
order by 1,2;
