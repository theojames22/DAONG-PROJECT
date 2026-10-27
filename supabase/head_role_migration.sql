-- =====================================================================
-- HEAD ROLE MIGRATION — collapse Admin + Head into Head; keep Staff
-- Run in Supabase → SQL Editor → New query → paste → Run.
-- Re-runnable and non-destructive to rows: the only data updates are the
-- role/position normalisation and zeroing a Head's required hours. No
-- account, attendance, output, schedule, booking or report row is ever
-- deleted.
--
-- THE MODEL AFTER THIS RUNS
--   Head  → role 'head'  → administrator dashboard, NO clock in/out,
--                          NO QR code, NO required weekly hours, and
--                          excluded from attendance compliance reports.
--   Staff → role 'staff' → employee dashboard, clocks in/out, carries a
--                          QR code and a required weekly hours target.
--
-- WHAT THIS DOES
--   1. profiles.role  : ('employee','admin')  → ('staff','head')
--   2. profiles.position: legacy 'admin'       → 'head'
--   3. Heads get required_weekly_hours = 0 (no required hours/units)
--   4. is_admin() now means role = 'head' (every RLS policy already
--      calls it, so all former Admin data access transfers to Head)
--   5. is_staff() helper + sessions INSERT is staff-only (a Head can
--      never generate an attendance record through the staff flow)
--   6. handle_new_user / notify_admins_on_project / get_admin_recipients
--      / finalize_month all recognise the new two-role model
--   7. Monthly reports only count Staff (Heads are out of scope)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 + 4. ROLE + POSITION NORMALISATION
--   The old CHECK on role is replaced. Data is remapped first, then the
--   tightened CHECK (a strict rename of the same two states) is added,
--   so re-adding it can never reject an existing row.
-- ---------------------------------------------------------------------
alter table public.profiles alter column role drop default;

do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
     where con.conrelid = 'public.profiles'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'role'
       and not att.attisdropped
  loop
    raise notice 'dropping profiles.role check "%"', r.conname;
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

-- Remap the two states. Order matters only for clarity; each statement is
-- independent of the others.
update public.profiles set role = 'head'  where role = 'admin';
update public.profiles set role = 'staff' where role = 'employee';

-- Legacy 'admin' position becomes 'head'. Staff job-title text is left
-- untouched (authorization is driven by `role`, not free-text position).
update public.profiles set position = 'head' where lower(position) = 'admin';

-- Heads have no required weekly hours / units.
update public.profiles set required_weekly_hours = 0 where role = 'head';

-- Tighten the CHECK to the new vocabulary. Named constraint keeps re-runs
-- predictable (the DO block above only drops single-column role checks).
do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('head', 'staff'));
exception
  when duplicate_object then null;
end $$;

alter table public.profiles alter column role set default 'staff';

-- profiles.email (cached copy of auth.users.email) is added by
-- admin_dashboard.sql. Guard it here so the trigger below is always safe,
-- even on a database where only schema.sql has been run.
alter table public.profiles add column if not exists email text;

-- Keep the cached email in sync for any user missing it.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;

-- ---------------------------------------------------------------------
-- 2. AUTHORIZATION HELPERS
--   is_admin() is THE check every RLS policy and RPC uses. Pointing it at
--   role = 'head' transfers every former Admin capability to Head with no
--   policy-by-policy rewrite. is_staff() is the mirror for staff-only
--   writes (attendance).
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'head'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'staff'
  );
$$;

-- ---------------------------------------------------------------------
-- 3. STAFF-ONLY ATTENDANCE INSERTS
--   Heads must never get attendance records through the normal staff
--   workflow, so only Staff may open a session. Existing head sessions
--   are preserved (this only governs future inserts).
-- ---------------------------------------------------------------------
drop policy if exists "Users can insert their own sessions" on public.sessions;
create policy "Users can insert their own sessions"
  on public.sessions for insert
  with check (auth.uid() = employee_id and public.is_staff());

-- ---------------------------------------------------------------------
-- 4. SIGNUP TRIGGER — default role is now 'staff'.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'role', 'staff'),
    new.email
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. PROJECT ALERTS — notify Heads (the administrators).
-- ---------------------------------------------------------------------
create or replace function public.notify_admins_on_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submitter_name text;
begin
  select coalesce(full_name, 'An employee')
    into submitter_name
    from public.profiles
   where id = new.submitted_by;

  insert into public.notifications (sender_id, receiver_id, message, project_id)
  select new.submitted_by,
         a.id,
         submitter_name || ' submitted a project for approval: ' || new.title,
         new.id
    from public.profiles a
   where a.role = 'head'
     and a.id <> new.submitted_by;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RECIPIENTS — employees message Heads.
-- ---------------------------------------------------------------------
create or replace function public.get_admin_recipients()
returns table (id uuid, full_name text, "position" text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.position
    from public.profiles p
   where p.role = 'head';
$$;

-- ---------------------------------------------------------------------
-- 7. MONTHLY REPORT FINALIZATION — Staff only.
--   Same body as supabase/reports.sql, with the eligible population
--   switched from position in ('staff','head') to role = 'staff'.
-- ---------------------------------------------------------------------
create or replace function public.finalize_month(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_today date := (now() at time zone public.app_timezone())::date;
  v_month date := date_trunc('month', p_month)::date;
  v_current_month date := date_trunc('month', v_local_today)::date;
  v_next_month date := (date_trunc('month', p_month)::date + interval '1 month')::date;
  v_written integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if v_month >= v_current_month then
    raise exception 'Only completed months can be finalized';
  end if;

  with eligible as (
    -- Only Staff carry a weekly requirement; Heads are out of scope.
    select id, coalesce(required_weekly_hours, 0) as weekly
      from public.profiles
     where role = 'staff'
  ),
  working_days as (
    select count(*)::integer as day_count
      from generate_series(v_month, (v_next_month - interval '1 day')::date, interval '1 day') d
     where extract(isodow from d) < 6
  ),
  submitted as (
    -- Any submitted output credits the day, whatever its review status.
    select distinct employee_id, date
      from public.outputs
     where date >= v_month
       and date < v_next_month
  ),
  approved as (
    -- Used only to label the day "output approved" in the drawer.
    select distinct employee_id, date
      from public.outputs
     where status = 'done'
       and date >= v_month
       and date < v_next_month
  ),
  output_states as (
    select
      o.employee_id,
      o.date,
      case
        when bool_or(o.status = 'done') then 'approved'
        when bool_or(o.status in ('pending', 'checking')) then 'pending'
        else 'rejected'
      end as output_status
    from public.outputs o
    where o.date >= v_month
      and o.date < v_next_month
    group by o.employee_id, o.date
  ),
  month_days as (
    select
      ad.employee_id,
      ad.date,
      ad.hours,
      ad.session_count,
      ad.has_open_session,
      ad.first_in,
      ad.last_out,
      (s.employee_id is not null) as has_output,
      (a.employee_id is not null) as has_approved_output,
      coalesce(os.output_status, 'none') as output_status
    from public.attendance_days ad
    left join submitted s
      on s.employee_id = ad.employee_id
     and s.date = ad.date
    left join approved a
      on a.employee_id = ad.employee_id
     and a.date = ad.date
    left join output_states os
      on os.employee_id = ad.employee_id
     and os.date = ad.date
    where ad.date >= v_month
      and ad.date < v_next_month
  ),
  daily as (
    select
      employee_id,
      jsonb_agg(
        jsonb_build_object(
          'date', date,
          'hours', hours,
          'session_count', session_count,
          'has_open_session', has_open_session,
          'has_output', has_output,
          'has_approved_output', has_approved_output,
          'is_credited', has_output and not has_open_session,
          'output_status', output_status,
          'first_in', first_in,
          'last_out', last_out
        ) order by date
      ) as daily
    from month_days
    group by employee_id
  ),
  totals as (
    select
      md.employee_id,
      round(sum(case when not md.has_open_session then md.hours else 0 end)::numeric, 2) as recorded_hours,
      round(sum(case when md.has_output and not md.has_open_session then md.hours else 0 end)::numeric, 2) as credited_hours,
      count(*) filter (where md.has_open_session)::integer as incomplete_records,
      count(distinct md.date) filter (where not md.has_open_session and extract(isodow from md.date) < 6)::integer as days_recorded,
      count(distinct md.date) filter (where extract(isodow from md.date) < 6)::integer as working_days_with_rows
    from month_days md
    group by md.employee_id
  ),
  computed as (
    select
      e.id as employee_id,
      e.weekly,
      wd.day_count,
      round((wd.day_count * e.weekly / 5.0)::numeric, 2) as required_hours,
      coalesce(t.recorded_hours, 0) as recorded_hours,
      coalesce(t.credited_hours, 0) as credited_hours,
      coalesce(t.incomplete_records, 0) as incomplete_records,
      coalesce(t.days_recorded, 0) as days_recorded,
      greatest(wd.day_count - coalesce(t.working_days_with_rows, 0), 0) as missing_days,
      coalesce(d.daily, '[]'::jsonb) as daily
    from eligible e
    cross join working_days wd
    left join totals t on t.employee_id = e.id
    left join daily d on d.employee_id = e.id
  ),
  with_percent as (
    select
      c.*,
      case
        when c.required_hours > 0 then round((c.credited_hours / c.required_hours * 100)::numeric, 2)
        else 0
      end as compliance_percent
    from computed c
  ),
  with_status as (
    select
      wp.*,
      case
        when wp.required_hours <= 0 then 'not_applicable'
        when wp.compliance_percent >= 86 then 'compliant'
        when wp.compliance_percent >= 75 then 'needs_improvement'
        else 'needs_attention'
      end as status
    from with_percent wp
  )
  insert into public.monthly_report_snapshots (
    employee_id, month, weekly_required_hours, required_hours,
    recorded_hours, credited_hours, compliance_percent, status,
    days_recorded, working_days, missing_days, incomplete_records,
    daily, finalized_at, finalized_by, version
  )
  select
    employee_id, v_month, weekly, required_hours,
    recorded_hours, credited_hours, compliance_percent, status,
    days_recorded, day_count, missing_days, incomplete_records,
    daily, now(), auth.uid(), 1
  from with_status
  on conflict (employee_id, month) do update set
    weekly_required_hours = excluded.weekly_required_hours,
    required_hours        = excluded.required_hours,
    recorded_hours        = excluded.recorded_hours,
    credited_hours        = excluded.credited_hours,
    compliance_percent    = excluded.compliance_percent,
    status                = excluded.status,
    days_recorded         = excluded.days_recorded,
    working_days          = excluded.working_days,
    missing_days          = excluded.missing_days,
    incomplete_records    = excluded.incomplete_records,
    daily                 = excluded.daily,
    finalized_at          = now(),
    finalized_by          = auth.uid(),
    version               = monthly_report_snapshots.version + 1;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

-- =====================================================================
-- VERIFY AFTER RUNNING (read-only)
--   select role, count(*) from public.profiles group by role;
--   -- expect only: head, staff
--
--   select position, count(*) from public.profiles group by position;
--   -- expect: head, staff (+ any staff job-title text)
--
--   select full_name, role, position, required_weekly_hours
--     from public.profiles where role = 'head';
--   -- expect required_weekly_hours = 0 for every Head
--
--   select public.is_admin();  -- true when the signed-in account is a Head
-- =====================================================================
