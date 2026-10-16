-- =====================================================================
-- EQUIPMENT USAGE MIGRATION
-- Run in Supabase → SQL Editor → New query → paste → Run.
-- Re-runnable and purely additive — no DROP statements, so Supabase
-- won't raise its "destructive operations" warning.
--
-- Adds:
--   1. equipment        — the catalog of trackable equipment
--   2. equipment_usage  — one row per usage (who used what, when)
--   3. position cleanup — normalizes legacy free-text positions
--                           to the three canonical values
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EQUIPMENT CATALOG
--    Names are unique (case-insensitive) so the dropdown on the
--    usage log page never shows duplicates.
-- ---------------------------------------------------------------------
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.equipment enable row level security;

-- Names are unique (case-insensitive) so the dropdown on the
-- usage log page never shows duplicates.
create unique index if not exists equipment_name_key
  on public.equipment (lower(name));

-- The catalog is shown in a dropdown to everyone signed in;
-- only admins/heads maintain it (the API route re-checks this
-- server-side — never trust the client).
--
-- Policies are created inside exception-guarded DO blocks so the
-- file stays re-runnable on every Postgres version
-- (CREATE POLICY IF NOT EXISTS is 15+ only).
do $$
begin
  create policy "Anyone signed in can view equipment"
    on public.equipment for select
    using (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Heads can insert equipment"
    on public.equipment for insert
    with check (public.is_admin());
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Heads can delete equipment"
    on public.equipment for delete
    using (public.is_admin());
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------
-- 2. EQUIPMENT USAGE LOG
--    Every row is tied to a real profile and a real equipment row
--    by foreign keys, so a usage record can never reference a
--    nonexistent user or piece of equipment. Entries are created by a
--    Head and may then be corrected (edit), cancelled (soft) or deleted
--    by a Head only — the RLS update/delete policies below are the sole
--    gate for those mutations.
-- ---------------------------------------------------------------------
create table if not exists public.equipment_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  remarks text,
  logged_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint equipment_usage_valid_range check (ended_at > started_at)
);

-- Existing installs (created before cancellation) gain the column here.
alter table public.equipment_usage
  add column if not exists cancelled_at timestamptz;

alter table public.equipment_usage enable row level security;

do $$
begin
  create policy "Users can view their own equipment usage"
    on public.equipment_usage for select
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Heads can view all equipment usage"
    on public.equipment_usage for select
    using (public.is_admin());
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Heads can insert equipment usage"
    on public.equipment_usage for insert
    with check (public.is_admin());
exception
  when duplicate_object then null;
end
$$;

-- Query performance: filtering by user/equipment and reading
-- the log newest-first.
create index if not exists equipment_usage_user_id_idx
  on public.equipment_usage (user_id);

create index if not exists equipment_usage_equipment_id_idx
  on public.equipment_usage (equipment_id);

create index if not exists equipment_usage_started_at_idx
  on public.equipment_usage (started_at desc);

-- ---------------------------------------------------------------------
-- 3. POSITION CLEANUP
--    Position is display metadata; authorization is driven by `role`.
--    Only the legacy 'Admin' value is normalised (to 'head') so a
--    Staff member's job-title text is never overwritten.
-- ---------------------------------------------------------------------
update public.profiles
  set position = 'head'
  where lower(position) = 'admin';

-- ---------------------------------------------------------------------
-- 4. BOOKING CONFLICT PREVENTION
--    Bookings are half-open time ranges [start, end): a booking that
--    ends at 11:00 and one that starts at 11:00 do NOT overlap, so
--    back-to-back reservations are allowed. The rules below block:
--      • the same equipment being reserved for overlapping times
--        (by different people — and identical re-entries)
--      • the same person holding overlapping bookings on any equipment
--    Cancelled rows are excluded by the WHERE clause, so cancelling
--    a booking frees its slot immediately while keeping the row as
--    history. The constraints also make double booking impossible
--    even when two admins save at the same instant.
--
--    This script NEVER deletes data. If legacy rows already overlap,
--    the constraints are skipped with a notice (not by removing anyone's
--    history); resolve the overlaps and re-run to add them.
-- ---------------------------------------------------------------------

-- gist support for the uuid equality operator inside the constraints.
create extension if not exists btree_gist;

-- The constraints can only be added when no active rows already overlap.
-- Legacy installs may hold genuine overlapping bookings (double entries),
-- and this script must never destroy those rows, so the constraints are
-- skipped (with a notice) until the data is overlap-free. Re-running the
-- file after cleaning up overlaps adds them.
do $$
declare
  overlapping_rows integer;
begin
  select count(*)
    into overlapping_rows
    from public.equipment_usage a
    join public.equipment_usage b
      on a.id < b.id
     and a.cancelled_at is null
     and b.cancelled_at is null
     and (a.equipment_id = b.equipment_id or a.user_id = b.user_id)
     and tstzrange(a.started_at, a.ended_at) && tstzrange(b.started_at, b.ended_at);

  if overlapping_rows > 0 then
    raise notice
      'equipment_usage: % overlapping active row(s) found — skipping exclusion constraints to avoid deleting data. Resolve the overlaps and re-run to enable them.',
      overlapping_rows;
    return;
  end if;

  -- Guard on pg_constraint and also catch 42P07 (duplicate_table): an
  -- exclusion constraint is backed by an index, so on a re-run Postgres
  -- can fail while creating that index before it reports duplicate_object.
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.equipment_usage'::regclass
      and conname = 'equipment_usage_no_equipment_overlap'
  ) then
    begin
      alter table public.equipment_usage
        add constraint equipment_usage_no_equipment_overlap
        exclude using gist (equipment_id with =, tstzrange(started_at, ended_at) with &&)
        where (cancelled_at is null);
    exception
      when duplicate_table then null;
      when duplicate_object then null;
    end;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.equipment_usage'::regclass
      and conname = 'equipment_usage_no_person_overlap'
  ) then
    begin
      alter table public.equipment_usage
        add constraint equipment_usage_no_person_overlap
        exclude using gist (user_id with =, tstzrange(started_at, ended_at) with &&)
        where (cancelled_at is null);
    exception
      when duplicate_table then null;
      when duplicate_object then null;
    end;
  end if;
end
$$;

-- Heads may correct or cancel an entry. The API routes (head-gated
-- server-side) are the only callers; entry content stays non-editable
-- for everyone else.
do $$
begin
  create policy "Heads can cancel equipment usage"
    on public.equipment_usage for update
    using (public.is_admin());
exception
  when duplicate_object then null;
end
$$;

-- Deleting an entry is a destructive Head-only action (the radial
-- menu's Delete). Without this policy RLS blocks every delete.
do $$
begin
  create policy "Heads can delete equipment usage"
    on public.equipment_usage for delete
    using (public.is_admin());
exception
  when duplicate_object then null;
end
$$;
