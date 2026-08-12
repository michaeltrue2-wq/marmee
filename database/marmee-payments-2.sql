-- ============================================================
--  MARMEE — PAYMENTS, follow-up
--
--  charge_attempts exists to make retries actually work.
--
--  Stripe replays the response for a repeated idempotency key for 24
--  hours. The charge function used a fixed key of marmee-visit-<id>, so
--  retrying a declined visit — even after the Mom fixed her card —
--  returned the original decline. Including the attempt number in the
--  key means a genuine retry is a new request, while a double-click
--  within one attempt is still safely deduplicated.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

alter table visits add column if not exists charge_attempts integer not null default 0;

select column_name, data_type, column_default
from information_schema.columns
where table_name = 'visits' and column_name = 'charge_attempts';
