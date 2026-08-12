-- ============================================================
--  MARMEE — PAYMENTS (step 1: a Mom pays for a visit)
--
--  Adds the columns Stripe needs. No card data is ever stored here —
--  only Stripe's opaque ids, plus brand and last4 so the app can show
--  "Visa ending 4242" without holding anything sensitive.
--
--  Run once in the SQL Editor. Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  1) Each household gets a Stripe customer and a saved card
-- ------------------------------------------------------------
alter table families add column if not exists stripe_customer_id   text;
alter table families add column if not exists payment_method_id    text;
alter table families add column if not exists card_brand           text;
alter table families add column if not exists card_last4           text;
alter table families add column if not exists card_exp             text;

create unique index if not exists families_stripe_customer_idx
  on families(stripe_customer_id) where stripe_customer_id is not null;

-- ------------------------------------------------------------
--  2) Each visit records what was charged
--     amount_cents is written when the visit is charged, so a later
--     rate change never rewrites history.
-- ------------------------------------------------------------
alter table visits add column if not exists amount_cents      integer;
alter table visits add column if not exists platform_fee_cents integer;
alter table visits add column if not exists payment_status    text
  not null default 'unpaid'
  check (payment_status in ('unpaid','processing','paid','failed','refunded'));
alter table visits add column if not exists stripe_payment_intent text;
alter table visits add column if not exists paid_at           timestamptz;
alter table visits add column if not exists payment_error     text;

create index if not exists visits_payment_status_idx on visits(payment_status);

-- ------------------------------------------------------------
--  3) A Mom may read and update her own card fields; the operator
--     sees everything. These policies already exist for families —
--     this just confirms nothing extra is needed.
--
--     NOTE: payment_status and stripe ids are written by the Netlify
--     function using the caller's own token, so RLS still applies.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
--  4) CHECK
-- ------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_name = 'families'
  and column_name in ('stripe_customer_id','payment_method_id','card_brand','card_last4','card_exp')
union all
select column_name, data_type
from information_schema.columns
where table_name = 'visits'
  and column_name in ('amount_cents','platform_fee_cents','payment_status','stripe_payment_intent','paid_at','payment_error')
order by 1;
