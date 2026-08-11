-- ============================================================
--  MARMEE — DATABASE SETUP
--  Paste this whole file into the Supabase SQL Editor and press Run.
--  It creates your tables, locks them down safely, and adds a little
--  sample data so nothing looks empty. You can run it once.
-- ============================================================

-- 1) MOMS  (your helpers)
create table if not exists moms (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_initial text,
  neighborhood text,
  experience text,
  bio text,
  photo_url text,
  status text not null default 'new' check (status in ('new','vetting','active','paused')),
  vetting_stage int not null default 0,          -- 0 applied, 1 references, 2 background, 3 welcome, 4 active
  areas text[] default '{}',                     -- {Home, Food, Errands, Keeping track}
  days_available text[] default '{}',
  times_available text[] default '{}',
  travel_radius text,
  drives boolean,
  supplies_pref text,
  rating numeric,
  bg_check_status text not null default 'not_started' check (bg_check_status in ('not_started','pending','clear')),
  phone text,
  created_at timestamptz not null default now()
);

-- 2) MOM REFERENCES  (two per mom, contacted privately)
create table if not exists mom_references (
  id uuid primary key default gen_random_uuid(),
  mom_id uuid references moms(id) on delete cascade,
  name text,
  relationship text,
  contact text,
  created_at timestamptz not null default now()
);

-- 3) FAMILIES  (your clients)
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text,
  household text,
  status text not null default 'active' check (status in ('lead','active','paused')),
  contact_name text,
  contact_email text,
  contact_phone text,
  joined_at date,
  created_at timestamptz not null default now()
);

-- 4) REQUESTS  (a family asking for help)
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  areas text[] default '{}',
  frequency text,
  preferred_window text,
  status text not null default 'open' check (status in ('open','matched','scheduled','closed')),
  created_at timestamptz not null default now()
);

-- 5) MATCHES  (a mom paired to a request / family)
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  mom_id uuid references moms(id) on delete set null,
  family_id uuid references families(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined','active')),
  created_at timestamptz not null default now()
);

-- 6) VISITS  (a scheduled or completed visit — earnings come from here)
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  mom_id uuid references moms(id) on delete set null,
  family_id uuid references families(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  visit_date date,
  visit_time text,
  areas text[] default '{}',
  hours numeric,
  rate numeric default 28,
  status text not null default 'upcoming' check (status in ('upcoming','confirmed','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- ============================================================
--  SECURITY — lock every table by default.
--  Your Supabase dashboard can still see and edit everything.
--  The public website can't read or change anything until we add
--  exact login rules in the next step. This keeps data private.
-- ============================================================
alter table moms            enable row level security;
alter table mom_references  enable row level security;
alter table families        enable row level security;
alter table requests        enable row level security;
alter table matches         enable row level security;
alter table visits          enable row level security;

-- ============================================================
--  SAMPLE DATA  (so your tables aren't empty while you look around)
-- ============================================================
insert into moms (first_name,last_initial,neighborhood,experience,status,vetting_stage,areas,days_available,times_available,travel_radius,drives,supplies_pref,rating,bg_check_status) values
 ('Ruth','M.','Munjoy Hill','A lifetime of it','active',4,'{Home,Food,Errands}','{Mon,Tue,Wed}','{Mornings}','Up to 30 min',true,'Either is fine',4.9,'clear'),
 ('Carol','D.','West End','20+ years','active',4,'{Home,Errands}','{Tue,Wed,Thu}','{Mornings,Afternoons}','Up to 15 min',true,'I bring my own',5.0,'clear'),
 ('Nadine','P.','Deering','Raised my own family','active',4,'{Food,Errands}','{Mon,Wed,Fri}','{Afternoons}','My neighborhood',true,'Either is fine',4.8,'clear'),
 ('Bev','L.','South Portland','10+ years','active',4,'{Home}','{Mon,Wed,Fri}','{Mornings}','Anywhere nearby',false,'I will use the family''s',4.7,'clear'),
 ('Diane','K.','East Bayside','20+ years','vetting',2,'{Food,Errands}','{Mon,Tue,Wed}','{Mornings}','Up to 15 min',true,'I bring my own',null,'pending'),
 ('Joan','R.','Falmouth','Raised my own family','new',0,'{Home}','{Sat,Sun}','{Mornings}','My neighborhood',false,'Either is fine',null,'not_started');

insert into families (name,neighborhood,household,status,joined_at) values
 ('The Wallaces','Cape Elizabeth','2 kids (4, 7)','active','2026-07-15'),
 ('The Amanos','Munjoy Hill','3 kids (5, 8, 10)','active','2026-08-01'),
 ('The Bricks','West End','1 kid (2)','active','2026-07-20'),
 ('The Sotos','Deering','2 kids (1, 3)','active','2026-08-03'),
 ('The Delgados','Munjoy Hill','2 kids','lead',null),
 ('The Chens','West End','1 kid','lead',null),
 ('The Okafors','Deering','2 kids','lead',null);

insert into requests (family_id,areas,frequency,preferred_window,status)
select id,'{Food,Home}','Weekly','Wed mornings','open' from families where name='The Delgados';
insert into requests (family_id,areas,frequency,preferred_window,status)
select id,'{Home}','Every 2 weeks','Fri afternoons','open' from families where name='The Chens';
insert into requests (family_id,areas,frequency,preferred_window,status)
select id,'{Food,Errands}','Weekly','Weekday 3-6pm','open' from families where name='The Okafors';

insert into visits (mom_id,family_id,visit_date,visit_time,areas,hours,rate,status)
select (select id from moms where first_name='Ruth'), (select id from families where name='The Amanos'),  '2026-08-08','9:00a','{Food,Home}',3,28,'upcoming';
insert into visits (mom_id,family_id,visit_date,visit_time,areas,hours,rate,status)
select (select id from moms where first_name='Ruth'), (select id from families where name='The Wallaces'),'2026-08-12','9:00a','{Home}',4,28,'upcoming';
insert into visits (mom_id,family_id,visit_date,visit_time,areas,hours,rate,status)
select (select id from moms where first_name='Carol'),(select id from families where name='The Bricks'),  '2026-08-08','1:00p','{Home}',2,28,'upcoming';
insert into visits (mom_id,family_id,visit_date,visit_time,areas,hours,rate,status)
select (select id from moms where first_name='Ruth'), (select id from families where name='The Amanos'),  '2026-08-06','9:00a','{Food,Home}',3,28,'completed';
insert into visits (mom_id,family_id,visit_date,visit_time,areas,hours,rate,status)
select (select id from moms where first_name='Ruth'), (select id from families where name='The Wallaces'),'2026-08-04','9:00a','{Home}',4,28,'completed';
