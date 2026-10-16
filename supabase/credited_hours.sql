-- =====================================================================
-- CREDITED HOURS MIGRATION — attendance hours vs credited hours
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Run it AFTER schema.sql, admin_dashboard.sql, attendance_qr.sql,
-- output_uploads.sql, fix_output_dates.sql, mirror_outputs_to_projects.sql.
--
-- Re-runnable: every statement is guarded. Safe to run twice.
--
-- THE RULE THIS IMPLEMENTS
--   Every Staff (employee) member has a required number of working hours
--   per week — profiles.required_weekly_hours, e.g. 40. Heads are
--   administrators and carry no attendance requirement.
--   The system tracks two separate numbers for each employee:
--
--     attendance_hours — the real clock-in/clock-out total, always
--                        recorded, never gated. Pure history.
--     credited_hours   — the slice of those hours that counts toward the
--                        weekly requirement.
--
--   Attendance hours are credited ONLY for a day on which the employee
--   has an output that is approved ('done') under the existing review
--   workflow. Clock 4 hours, submit nothing → 4 attendance hours,
--   credited 0/40. Get that day's output approved → the same 4 hours
--   become creditable, credited 4/40.
--
--   Because credited hours are DERIVED from (attendance_days ⋈ outputs)
--   rather than incremented, an output being reviewed, approved,
--   rejected or updated can never double count: each day's hours are
--   summed at most once, and re-approving simply re-satisfies the join.
--
-- WHAT THIS DOES
--   1. Persists attendance hours: the attendance_days table and the
--      sessions trigger that maintains it. (These were introduced in an
--      earlier migration; they are recreated here guarded, so this file
--      also works on a fresh database.)
--   2. Removes the units system that was created on the temp-push branch
--      (supabase/migration_units.sql) and the units counter this repo's
--      working tree carried earlier. No units field or table remains.
--   3. Normalises outputs.status to the hours-era vocabulary.
--   4. Adds attendance_day_status (per day) and employee_week_hours
--      (per week) views that compute credited hours from the database.
--
-- WHAT IT DOES NOT TOUCH
--   • profiles.required_weekly_hours — unchanged, still the hours target.
--   • sessions / projects / notifications and every existing approval
--     trigger (mirror_output_to_project, sync_output_from_project,
--     notify_employee_on_*).
--   • The attendance and output-submission workflows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TIMEZONE + ATTENDANCE DAYS — the persisted attendance-hours record.
-- ---------------------------------------------------------------------

-- 1a. The local calendar day the app groups by, so the database agrees
--     with the app instead of using UTC (which misfiles every
--     early-morning session east of UTC). One row is the single knob.
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

alter table public.app_settings enable row level security;

drop policy if exists "Heads can view app settings" on public.app_settings;
create policy "Heads can view app settings"
  on public.app_settings for select
  using (public.is_admin());

drop policy if exists "Heads can update app settings" on public.app_settings;
create policy "Heads can update app settings"
  on public.app_settings for update
  using (public.is_admin());

-- Seeding is idempotent; an admin's later edit is never overwritten.
insert into public.app_settings (key, value)
values ('timezone', 'Asia/Manila')
on conflict (key) do nothing;

-- Security definer: the sessions trigger below runs as the clocking-out
-- user, who must not be blocked from resolving the timezone by RLS on
-- app_settings. The value is a timezone name and nothing more.
create or replace function public.app_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'timezone'),
    'Asia/Manila'
  );
$$;

-- 1b. One row per employee per local date. hours is the day's total;
--     first_in / last_out / session_count serve the history table.
create table if not exists public.attendance_days (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  hours numeric not null default 0 check (hours >= 0),
  session_count integer not null default 0 check (session_count >= 0),
  first_in timestamptz,
  last_out timestamptz,
  has_open_session boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (employee_id, date)
);

create index if not exists attendance_days_date_idx
  on public.attendance_days (date);

-- Attendance pages scan sessions by employee and time heavily.
create index if not exists sessions_employee_id_time_in_idx
  on public.sessions (employee_id, time_in);

alter table public.attendance_days enable row level security;

-- Read-only for users: an employee sees their own history, admins see
-- everyone's. Deliberately NO insert/update/delete policy — the only
-- writer is the security-definer trigger in 1c, so a clocked-in user
-- cannot forge or erase history from the browser.
drop policy if exists "Users can view their own attendance days" on public.attendance_days;
create policy "Users can view their own attendance days"
  on public.attendance_days for select
  using (auth.uid() = employee_id);

drop policy if exists "Heads can view all attendance days" on public.attendance_days;
create policy "Heads can view all attendance days"
  on public.attendance_days for select
  using (public.is_admin());

-- 1c. Keep attendance_days current. refresh_attendance_day recomputes one
--     employee's one local day from scratch, so repeated calls are safe
--     and cannot double count. An open session counts up to now(),
--     matching totalHours() in lib/attendance.ts so a running clock shows
--     live hours.
create or replace function public.refresh_attendance_day(p_employee_id uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours numeric;
  v_count integer;
  v_first_in timestamptz;
  v_last_out timestamptz;
  v_open boolean;
begin
  select
    coalesce(sum(extract(epoch from (coalesce(time_out, now()) - time_in)) / 3600.0), 0),
    count(*),
    min(time_in),
    max(time_out),
    bool_or(time_out is null)
  into v_hours, v_count, v_first_in, v_last_out, v_open
  from public.sessions
  where employee_id = p_employee_id
    and (time_in at time zone public.app_timezone())::date = p_day;

  -- No sessions left for that day: drop the row rather than leave a 0h
  -- phantom behind, so "absent" and "deleted" both read as no record.
  if v_count = 0 then
    delete from public.attendance_days
     where employee_id = p_employee_id
       and date = p_day;
    return;
  end if;

  insert into public.attendance_days
    (employee_id, date, hours, session_count, first_in, last_out, has_open_session, updated_at)
  values
    (p_employee_id, p_day, round(v_hours, 4), v_count, v_first_in, v_last_out, v_open, now())
  on conflict (employee_id, date) do update
    set hours            = excluded.hours,
        session_count    = excluded.session_count,
        first_in         = excluded.first_in,
        last_out         = excluded.last_out,
        has_open_session = excluded.has_open_session,
        updated_at       = now();
end;
$$;

create or replace function public.sync_attendance_days_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := public.app_timezone();
  v_old_day date;
  v_new_day date;
begin
  if tg_op = 'INSERT' then
    perform public.refresh_attendance_day(
      new.employee_id, (new.time_in at time zone v_tz)::date
    );
  elsif tg_op = 'DELETE' then
    perform public.refresh_attendance_day(
      old.employee_id, (old.time_in at time zone v_tz)::date
    );
  else
    v_old_day := (old.time_in at time zone v_tz)::date;
    v_new_day := (new.time_in at time zone v_tz)::date;
    perform public.refresh_attendance_day(new.employee_id, v_new_day);
    -- An update that also moved the timestamp (or the owner) has to
    -- refresh the previous day too, or it would keep stale hours.
    if v_old_day is distinct from v_new_day
       or old.employee_id is distinct from new.employee_id then
      perform public.refresh_attendance_day(old.employee_id, v_old_day);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists on_session_sync_attendance_day on public.sessions;
create trigger on_session_sync_attendance_day
  after insert or update or delete on public.sessions
  for each row execute procedure public.sync_attendance_days_from_session();

-- ---------------------------------------------------------------------
-- 2. REMOVE THE UNITS SYSTEM.
--    Drop in dependency order: trigger first (the function is used by
--    it), then the functions, then the columns, then the tables.
-- ---------------------------------------------------------------------

-- 2a. The units counter that lived on profiles.
drop trigger if exists on_output_changed_sync_units on public.outputs;
drop function if exists public.sync_employee_units_from_output();
drop function if exists public.apply_unit_delta(uuid, integer);
drop function if exists public.recompute_employee_units(uuid);

alter table public.profiles
  drop column if exists required_weekly_units,
  drop column if exists completed_units;

-- 2b. The temp-push units system.
--     trigger_update_deductions is what upserts weekly_deductions; it is
--     also what breaks the reject flow, because weekly_deductions'
--     last_output_status check has no 'rejected' value.
drop trigger if exists trigger_update_deductions on public.outputs;
drop function if exists public.update_weekly_deductions();
drop function if exists public.calculate_remaining_units(uuid, date);

-- The units column on outputs. Nothing reads it once the trigger above
-- and its function are gone.
alter table public.outputs
  drop column if exists units_deducted;

-- The units tables. weekly_deductions holds rows with total_deducted = 0
-- only; the credited-hours views supersede them, so nothing of value is
-- lost. weekly_requirements and activity_logs are empty.
drop table if exists public.weekly_deductions;
drop table if exists public.weekly_requirements;
drop table if exists public.activity_logs;

-- ---------------------------------------------------------------------
-- 3. NORMALISE outputs.status.
--    The units migration widened it with 'approved', 'for_checking' and
--    'no_output'. The hours-era workflow uses pending | checking | done
--    | rejected, which mirror_outputs_to_projects.sql already relies on.
--    Remap any legacy row first, then re-tighten the check.
-- ---------------------------------------------------------------------
update public.outputs set status = 'done'    where status = 'approved';
update public.outputs set status = 'pending' where status = 'for_checking';
update public.outputs set status = 'pending' where status = 'no_output';

do $$
declare
  r record;
begin
  for r in
    select con.conname, pg_get_constraintdef(con.oid) as definition
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
     where con.conrelid = 'public.outputs'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'status'
       and not att.attisdropped
  loop
    raise notice 'replacing outputs.status check "%": %', r.conname, r.definition;
    execute format('alter table public.outputs drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.outputs
  add constraint outputs_status_check
  check (status in ('pending', 'checking', 'done', 'rejected'));

-- ---------------------------------------------------------------------
-- 4. CREDITED-HOURS VIEWS.
--    Both are security_invoker, so the existing RLS on attendance_days
--    and outputs applies: staff see their own, admins see everyone.
-- ---------------------------------------------------------------------

-- 4a. Per day: the recorded attendance hours, plus whether the day has
--     an approved output and is therefore creditable.
--     A day that is still running is not credited yet — the clock has to
--     be closed before the hours are final.
create or replace view public.attendance_day_status
with (security_invoker = true) as
with approved_days as (
  select distinct employee_id, date
    from public.outputs
   where status = 'done'
)
select
  d.employee_id,
  d.date,
  d.hours,
  d.session_count,
  d.has_open_session,
  (a.employee_id is not null) as has_approved_output,
  (a.employee_id is not null and not d.has_open_session) as is_credited
from public.attendance_days d
left join approved_days a
  on a.employee_id = d.employee_id
 and a.date = d.date;

-- 4b. Per week: attendance hours (always) beside credited hours (the
--     part that counts toward the weekly requirement).
--     ISO day-of-week is 1=Monday..7=Sunday, so `date - (isodow - 1)`
--     is the Monday of that week — the same window the app uses in
--     lib/attendance.ts getWeekRange().
create or replace view public.employee_week_hours
with (security_invoker = true) as
select
  s.employee_id,
  (s.date - (extract(isodow from s.date)::int - 1))::date as week_start,
  round(sum(s.hours)::numeric, 4) as attendance_hours,
  round(sum(case when s.is_credited then s.hours else 0 end)::numeric, 4) as credited_hours,
  count(*)::integer as attendance_days,
  count(*) filter (where s.is_credited)::integer as credited_days
from public.attendance_day_status s
group by 1, 2;

-- ---------------------------------------------------------------------
-- 5. REALTIME — let the admin attendance list refresh the moment a
--    persisted attendance day changes, matching the sessions/outputs
--    subscriptions already set up by attendance_qr.sql.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.attendance_days;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 6. BACKFILL — recompute attendance_days from sessions. Idempotent:
--    ON CONFLICT DO UPDATE recalculates the same numbers.
-- ---------------------------------------------------------------------
insert into public.attendance_days
  (employee_id, date, hours, session_count, first_in, last_out, has_open_session)
select
  s.employee_id,
  (s.time_in at time zone public.app_timezone())::date as date,
  round(sum(extract(epoch from (coalesce(s.time_out, now()) - s.time_in)) / 3600.0), 4) as hours,
  count(*)::integer as session_count,
  min(s.time_in) as first_in,
  max(s.time_out) as last_out,
  bool_or(s.time_out is null) as has_open_session
from public.sessions s
group by 1, 2
on conflict (employee_id, date) do update
  set hours            = excluded.hours,
      session_count    = excluded.session_count,
      first_in         = excluded.first_in,
      last_out         = excluded.last_out,
      has_open_session = excluded.has_open_session,
      updated_at       = now();

-- ---------------------------------------------------------------------
-- VERIFY AFTER RUNNING (read-only — safe to run any time)
--
--   -- no units leftover anywhere:
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('weekly_requirements','weekly_deductions','activity_logs');
--   -- expect: zero rows
--
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and (table_name, column_name) in (('profiles','required_weekly_units'),
--                                        ('profiles','completed_units'),
--                                        ('outputs','units_deducted'));
--   -- expect: zero rows
--
--   -- credited hours are the approved-output days only:
--   select employee_id, week_start, attendance_hours, credited_hours,
--          credited_days, attendance_days
--     from public.employee_week_hours order by week_start desc;
--   -- credited_hours must equal the sum of hours on days that have an
--   -- approved output, and no larger
--
--   -- an output with no attendance must not credit anything:
--   select count(*) from public.employee_week_hours where credited_hours > 0;
--   -- cross-check by hand against the approved outputs
--
--   -- rejecting an approval must take the credit back:
--   select employee_id, date, hours, has_approved_output, is_credited
--     from public.attendance_day_status order by date desc;
-- ---------------------------------------------------------------------
