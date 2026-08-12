-- ============================================================
--  MARMEE — PAYMENTS, 3D Secure
--
--  Some cards require the cardholder to approve a charge in their
--  banking app, even for a card saved on file. Stripe returns
--  `authentication_required` and the payment sits unfinished.
--
--  Today that reads as a plain decline, which sends the Mom off to
--  replace a card that was never the problem. This adds a status for
--  it so the app can ask her to approve instead.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

-- The visits.payment_status CHECK needs to allow the new value.
alter table visits drop constraint if exists visits_payment_status_check;

alter table visits add constraint visits_payment_status_check
  check (payment_status in ('unpaid','processing','paid','failed','refunded','needs_auth'));

-- Kept so the Mom's app can finish the authentication without us
-- re-creating the payment. It is not a secret in the usual sense —
-- it only works for this one payment, and RLS already limits the row
-- to her household and operators.
alter table visits add column if not exists stripe_client_secret text;

select column_name
from information_schema.columns
where table_name='visits' and column_name in ('stripe_client_secret','charge_attempts','payment_status')
order by column_name;
