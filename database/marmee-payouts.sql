-- ============================================================
--  MARMEE — PAYING THE MARMS
--
--  Money currently comes in through Stripe and goes out through Mike
--  writing a cheque. That works at one Marm and fails at five — and it
--  means a woman who worked on Tuesday has no idea when she gets paid.
--
--  This adds the record-keeping for Stripe Connect. The shape:
--
--    · Each Marm gets a Stripe Express account. Stripe collects her bank
--      details and runs the identity checks — Marmee never sees or stores
--      a bank account number, which is the whole reason to use Express
--      rather than collecting it ourselves.
--
--    · A visit that has been paid by the Mom becomes eligible for a
--      transfer of her 85%. The transfer is a separate object from the
--      charge, so a payout can fail, be retried, or be held back without
--      touching the money the Mom already paid.
--
--    · `payout_cents` is written at transfer time and never recomputed.
--      What she was actually sent is a fact; recalculating it later from
--      a rate that may since have changed would quietly rewrite history.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

-- ---- 1) Her Stripe account -----------------------------------------
alter table moms add column if not exists stripe_account_id  text;
-- Stripe tells us when she has finished onboarding and is allowed to
-- receive money. Until then a transfer would simply fail.
alter table moms add column if not exists payouts_enabled    boolean not null default false;
alter table moms add column if not exists payouts_checked_at timestamptz;
-- Anything Stripe still wants from her, in her words, so the console can
-- say "she still needs to add a bank account" instead of "not enabled".
alter table moms add column if not exists payouts_needs      text;

create unique index if not exists moms_stripe_account_idx
  on moms(stripe_account_id) where stripe_account_id is not null;

-- ---- 2) The payout for a visit --------------------------------------
alter table visits add column if not exists payout_cents    integer;
alter table visits add column if not exists transfer_id     text;
alter table visits add column if not exists transferred_at  timestamptz;
alter table visits add column if not exists payout_error    text;
alter table visits add column if not exists payout_attempts integer not null default 0;

create index if not exists visits_awaiting_payout_idx
  on visits(payment_status) where transferred_at is null;

-- ---- 3) What is owed ------------------------------------------------
-- A visit the Mom has paid for, that the Marm has not yet been sent.
-- Refunded visits are excluded: the money went back, so nothing is owed.
create or replace function owed_to_marms()
returns table(mom_id uuid, visits bigint, cents bigint)
language sql stable security definer set search_path = public as $$
  select v.mom_id,
         count(*)::bigint,
         sum(round(coalesce(v.amount_cents,0) * 0.85))::bigint
  from visits v
  where v.payment_status = 'paid'
    and v.transferred_at is null
    and v.mom_id is not null
  group by v.mom_id
$$;

revoke all on function owed_to_marms() from anon;
grant execute on function owed_to_marms() to authenticated;

-- ---- 4) She may read her own Stripe state, never write it -----------
-- The columns above live on `moms`, and "moms self update" already lets
-- her edit her own row. She must not be able to mark herself payable or
-- point payouts at another account, so those columns are taken away at
-- the grant level, which no policy can override.
revoke update (stripe_account_id, payouts_enabled, payouts_checked_at, payouts_needs)
  on moms from authenticated;

-- Same for the visit payout fields: only the server writes these.
revoke update (payout_cents, transfer_id, transferred_at, payout_error, payout_attempts)
  on visits from authenticated;

-- ---- Confirm ---------------------------------------------------------
select column_name from information_schema.columns
where table_name='moms' and column_name like 'payout%' or
      (table_name='moms' and column_name='stripe_account_id')
order by column_name;
