-- Task Tracker v2 schema. Run once in the Supabase SQL Editor (same project as v1).
-- Everything lives in its own schema, tt2, so it cannot clash with v1 or the course tables.
-- Login accounts are shared with v1 (auth.users).

create schema if not exists tt2;

-- ---------------------------------------------------------------- people
-- One row per person who has signed in at least once. The backend fills this in
-- (POST/GET /me), so a PM can add someone to a project by email.
create table if not exists tt2.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_key on tt2.profiles (lower(email));

-- ---------------------------------------------------------------- projects
-- owner_id is the PM. The owner is also stored as a member with role PM (see below).
create table if not exists tt2.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  status text not null default 'active' check (status in ('active','on_hold','done')),
  health text not null default 'green' check (health in ('green','amber','red')),
  health_note text check (health_note is null or char_length(health_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_idx on tt2.projects(owner_id);

create table if not exists tt2.project_members (
  project_id uuid not null references tt2.projects(id) on delete cascade,
  user_id uuid not null references tt2.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),  -- copy of the profile name, kept in step by the triggers below
  role text not null check (role in ('PM','BA','Dev','QA','Infra')),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on tt2.project_members(user_id);
-- exactly one PM per project
create unique index if not exists project_one_pm on tt2.project_members(project_id) where role = 'PM';

-- The member name is filled from the profile on insert, and follows later profile name changes.
create or replace function tt2.set_member_name() returns trigger language plpgsql as $$
begin
  select name into new.name from tt2.profiles where id = new.user_id;
  return new;
end $$;
drop trigger if exists trg_member_name on tt2.project_members;
create trigger trg_member_name before insert on tt2.project_members
for each row execute function tt2.set_member_name();

create or replace function tt2.sync_member_name() returns trigger language plpgsql as $$
begin
  update tt2.project_members set name = new.name where user_id = new.id;
  return new;
end $$;
drop trigger if exists trg_profile_name on tt2.profiles;
create trigger trg_profile_name after update of name on tt2.profiles
for each row execute function tt2.sync_member_name();

-- ---------------------------------------------------------------- meetings (PM only)
create table if not exists tt2.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references tt2.projects(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  meeting_date date,
  meeting_time text check (meeting_time is null or char_length(meeting_time) <= 60),
  location text check (location is null or char_length(location) <= 120),
  attendees_internal text[] not null default '{}',
  attendees_client text[] not null default '{}',
  transcript text not null default '' check (char_length(transcript) <= 200000),
  summary_rows jsonb,
  next_actions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_project_idx on tt2.meetings(project_id);

-- ---------------------------------------------------------------- tasks
create table if not exists tt2.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references tt2.projects(id) on delete cascade,
  meeting_id uuid references tt2.meetings(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  assignee_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 5000),
  status text not null default 'todo' check (status in ('todo','in_progress','pending_review','done')),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  due_date date,
  due_time text check (due_time is null or char_length(due_time) <= 20),
  is_blocked boolean not null default false,
  blocker_reason text check (blocker_reason is null or char_length(blocker_reason) <= 300),
  ticket_ref text check (ticket_ref is null or char_length(ticket_ref) <= 40),
  module text check (module is null or char_length(module) <= 60),
  estimate_hrs numeric check (estimate_hrs is null or estimate_hrs >= 0),
  ticket_stage text check (ticket_stage in (
    'NEW / CLARIFICATION','FOR DEVELOPMENT','PENDING DEV ASSIGNMENT',
    'DEVELOPMENT IN PROGRESS','TEST FAILED','FOR CODE MERGE & DEPLOYMENT','FOR TESTING',
    'FOR UAT DEPLOYMENT','UAT FIXPACK','FOR PROD DEPLOYMENT','CLOSED')),
  -- soft delete: the PM can restore; only the PM can purge for good
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_blocked or (blocker_reason is not null and char_length(btrim(blocker_reason)) > 0)),
  -- the assignee must be a member of the same project. MATCH SIMPLE: skipped while assignee_id is null.
  -- If the member is removed, only assignee_id is cleared (needs PostgreSQL 15+, Supabase has it).
  foreign key (project_id, assignee_id) references tt2.project_members(project_id, user_id)
    on delete set null (assignee_id)
);
create index if not exists tasks_project_idx on tt2.tasks(project_id, status) where deleted_at is null;
create index if not exists tasks_assignee_idx on tt2.tasks(assignee_id) where deleted_at is null;
create index if not exists tasks_due_idx on tt2.tasks(due_date) where deleted_at is null;

-- ---------------------------------------------------------------- activity log
-- Who did what and when. task_id has no foreign key on purpose: the history stays after a purge.
create table if not exists tt2.activity_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references tt2.projects(id) on delete cascade,
  task_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action text not null check (action in
    ('created','updated','deleted','restored','purged','member_added','member_removed','role_changed')),
  entity text not null check (entity in ('task','project','member')),
  entity_id uuid,
  entity_label text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_project_idx on tt2.activity_log(project_id, created_at desc);
create index if not exists activity_task_idx on tt2.activity_log(task_id, created_at desc);

-- ---------------------------------------------------------------- pending invites
-- A PM invites an email that has no account yet. When that person first signs in (GET /me),
-- the backend turns the row into a real project_members row and deletes it.
create table if not exists tt2.pending_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references tt2.projects(id) on delete cascade,
  email text not null,
  role text not null check (role in ('BA','Dev','QA','Infra')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists pending_invites_project_email on tt2.pending_invites (project_id, lower(email));
create index if not exists pending_invites_email_idx on tt2.pending_invites (lower(email));

-- ---------------------------------------------------------------- security
-- The backend uses a server connection and checks roles itself (same pattern as v1 and Chapter 16).
-- RLS stays on with no policies, and the browser roles get nothing, so the Supabase Data API cannot read these tables.
alter table tt2.profiles enable row level security;
alter table tt2.projects enable row level security;
alter table tt2.project_members enable row level security;
alter table tt2.meetings enable row level security;
alter table tt2.tasks enable row level security;
alter table tt2.activity_log enable row level security;
alter table tt2.pending_invites enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema tt2 from anon;
    revoke all on all tables in schema tt2 from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema tt2 from authenticated;
    revoke all on all tables in schema tt2 from authenticated;
  end if;
end $$;

-- Malaysia time for the whole database (v1 already runs this line; running it again is harmless).
-- The backend also sets it per request in get_db.
alter database postgres set timezone to 'Asia/Kuala_Lumpur';
