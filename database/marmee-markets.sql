-- ============================================================
--  MARMEE — MARKETS, ZIP CODES, DISTANCE
--
--  Today "where are you" is a hardcoded <select> of fourteen Portland
--  neighborhoods, duplicated in two forms, and matching compares those
--  strings for exact equality. That breaks the moment someone types
--  "S. Portland", and it cannot describe a second city at all.
--
--  This replaces it with three ideas:
--
--    markets      a metro. Has its own hourly rate and its own
--                 status, so you open cities one at a time.
--    market_zips  which ZIP codes belong to that metro. This is what
--                 places a person, and it needs no external service.
--    zip_codes    a cache of ZIP -> lat/lng, filled in as people sign
--                 up. Optional. Distance sharpens matching where we
--                 have it; nothing breaks where we don't.
--
--  Neighborhood stays, as a label people recognise — "Munjoy Hill"
--  means something to a Portlander — but it is no longer the key
--  anything is matched on.
--
--  Run in the SQL Editor. Safe to re-run.
-- ============================================================

-- ---- 1) MARKETS ---------------------------------------------------
create table if not exists markets (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,                 -- 'Greater Portland'
  slug              text not null unique,           -- 'portland-me'
  state             text not null,                 -- 'ME'
  timezone          text not null default 'America/New_York',
  -- $28/hr in Portland is not $28/hr in Boston. The rate lives here
  -- rather than in three hardcoded constants that must agree.
  hourly_rate_cents integer not null default 2800,
  -- A market stays 'waitlist' until enough vetted Marms cover it. A Mom
  -- who signs up into an empty market waits three weeks and then tells
  -- her friends Marmee does not work.
  status            text not null default 'waitlist'
                    check (status in ('waitlist','live','paused')),
  launch_min_marms  integer not null default 5,
  created_at        timestamptz not null default now()
);

create table if not exists market_zips (
  zip       text primary key,
  market_id uuid not null references markets(id) on delete cascade
);
create index if not exists market_zips_market_idx on market_zips(market_id);

-- ---- 2) ZIP -> COORDINATES (cache, optional) ----------------------
create table if not exists zip_codes (
  zip        text primary key,
  lat        numeric(9,6),
  lng        numeric(9,6),
  city       text,
  state      text,
  updated_at timestamptz not null default now()
);

-- ---- 3) PEOPLE GET A ZIP AND A MARKET -----------------------------
alter table moms     add column if not exists zip           text;
alter table moms     add column if not exists market_id     uuid references markets(id);
alter table moms     add column if not exists radius_miles  integer;

alter table families add column if not exists zip           text;
alter table families add column if not exists market_id     uuid references markets(id);

create index if not exists moms_market_idx     on moms(market_id);
create index if not exists families_market_idx on families(market_id);

-- ---- 4) DISTANCE ---------------------------------------------------
-- Haversine in miles. Returns null when either end is unknown, and the
-- matching code treats null as "cannot say" rather than "far away".
create or replace function miles_between(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric language sql immutable as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round(
      3958.7613 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      ))::numeric, 1)
  end
$$;

-- How far apart two ZIPs are, when we happen to know both.
create or replace function zip_miles(a text, b text)
returns numeric language sql stable as $$
  select miles_between(x.lat, x.lng, y.lat, y.lng)
  from zip_codes x, zip_codes y
  where x.zip = a and y.zip = b
$$;

-- Placing someone needs no geocoder at all: their ZIP is either in a
-- market's list or it is not.
create or replace function market_for_zip(z text)
returns uuid language sql stable as $$
  select market_id from market_zips where zip = z
$$;

-- ---- 5) READ ACCESS ------------------------------------------------
-- The sign-up forms need to read markets before anyone has an account,
-- so this is readable by anon. Nobody but an operator writes it.
alter table markets     enable row level security;
alter table market_zips enable row level security;
alter table zip_codes   enable row level security;

drop policy if exists "markets public read" on markets;
create policy "markets public read" on markets
  for select to anon, authenticated using (true);

drop policy if exists "markets operator write" on markets;
create policy "markets operator write" on markets
  for all to authenticated using (is_operator()) with check (is_operator());

drop policy if exists "market_zips public read" on market_zips;
create policy "market_zips public read" on market_zips
  for select to anon, authenticated using (true);

drop policy if exists "market_zips operator write" on market_zips;
create policy "market_zips operator write" on market_zips
  for all to authenticated using (is_operator()) with check (is_operator());

drop policy if exists "zip_codes public read" on zip_codes;
create policy "zip_codes public read" on zip_codes
  for select to anon, authenticated using (true);

drop policy if exists "zip_codes operator write" on zip_codes;
create policy "zip_codes operator write" on zip_codes
  for all to authenticated using (is_operator()) with check (is_operator());

-- ---- 6) WAITLIST ---------------------------------------------------
-- Somebody in a city you have not opened should leave their ZIP, not
-- hit a form that goes nowhere. This is also the only honest signal for
-- which metro to open next, and how many Moms are already waiting there
-- on day one.
create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  side       text not null check (side in ('mom','marm')),
  email      text not null,
  zip        text,
  name       text,
  note       text,
  market_id  uuid references markets(id),
  created_at timestamptz not null default now()
);
create index if not exists waitlist_zip_idx on waitlist(zip);

alter table waitlist enable row level security;

-- Anyone can add themselves. Only an operator can read the list — it is
-- a pile of names and email addresses.
drop policy if exists "waitlist join" on waitlist;
create policy "waitlist join" on waitlist
  for insert to anon, authenticated with check (true);

drop policy if exists "waitlist operator read" on waitlist;
create policy "waitlist operator read" on waitlist
  for select to authenticated using (is_operator());

-- ---- 7) SEED THE MARKET THAT ALREADY EXISTS ------------------------
insert into markets (name, slug, state, hourly_rate_cents, status, launch_min_marms)
values ('Greater Portland', 'portland-me', 'ME', 2800, 'live', 5)
on conflict (slug) do nothing;

-- Greater Portland ZIPs: Portland, South Portland, Cape Elizabeth,
-- Falmouth, Scarborough, Westbrook, Cumberland, Yarmouth, Gorham.
insert into market_zips (zip, market_id)
select z, m.id
from markets m,
     unnest(array[
       '04101','04102','04103','04104','04105','04106','04107','04108','04109',
       '04110','04112','04116','04122','04123','04124',
       '04074','04092','04093','04021','04096','04038','04062','04070'
     ]) z
where m.slug = 'portland-me'
on conflict (zip) do nothing;

-- Everyone already in the system is in Portland.
update moms     set market_id = (select id from markets where slug='portland-me') where market_id is null;
update families set market_id = (select id from markets where slug='portland-me') where market_id is null;

-- ---- Confirm -------------------------------------------------------
select m.name, m.status, m.hourly_rate_cents,
       (select count(*) from market_zips z where z.market_id = m.id) as zips,
       (select count(*) from moms     x where x.market_id = m.id) as marms,
       (select count(*) from families f where f.market_id = m.id) as moms
from markets m
order by m.name;
