-- =====================================================================
-- MONTHLY REPORTS MIGRATION — snapshots + finalization
-- Run in Supabase → SQL Editor → New query → paste → Run.
-- Re-runnable and purely additive — no DROP statements, so Supabase
-- won't raise its "destructive operations" warning.
--
-- Delivers the Reports feature end to end:
--   0. attendance_day_status — re-created with first_in / last_out
--      (the daily log needs the actual punch times; the view never
--      exposed them). Append-only, so every existing reader of the
--      view — including employee_week_hours — keeps working.
--   1. monthly_report_snapshots — the frozen record for closed months
--   2. finalize_month()          — idempotent, versioned finalization
--   3. optional pg_cron schedule
--
-- REUSES (nothing here duplicates them):
--   profiles, sessions, outputs, attendance_days,
--   attendance_day_status (approved-output days), app_timezone()
--
-- Compliance thresholds live ONCE in lib/report/constants.ts
-- (compliant ≥ 86, needs improvement ≥ 75, below 75 needs attention).
-- The same numbers are applied below; lib/report re-derives the status
-- from the stored percent + required hours with that shared function,
-- and scripts/verify_reports.mjs asserts the two agree.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTEND attendance_day_status WITH THE PUNCH TIMES
--    Optional but useful: the view carried the per-day credited flag but
--    not first_in / last_out, so the details drawer could not show
--    "In: 9:00 AM / Out: 5:00 PM" from it. They live on attendance_days.
--    CREATE OR REPLACE VIEW only permits appending columns, which keeps
--    every existing dependent (employee_week_hours) valid.
--    security_invoker = true is preserved so RLS on attendance_days and
--    outputs still applies: staff see only their own days.
--    NOTE: lib/report reads the punch times from attendance_days
--    directly and only the credit flags from this view, so the reports
--    work whether or not this statement runs.
-- ---------------------------------------------------------------------
create or replace view public.attendance_day_status
with (security_invoker = true) as
with approved_days as (
  -- An approved output is status 'done' under the existing workflow.
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
  (a.employee_id is not null and not d.has_open_session) as is_credited,
  d.first_in,
  d.last_out
from public.attendance_days d
left join approved_days a
  on a.employee_id = d.employee_id
 and a.date = d.date;

-- ---------------------------------------------------------------------
-- 1. SNAPSHOT TABLE — one frozen row per person per reporting month.
--    `month` is always the FIRST day of the month (date, not text), so
--    the unique constraint below cannot be bypassed by "2026-10" vs
--    "2026-10-01".
--    `daily` is the frozen per-day detail the details drawer renders,
--    so a closed month's calendar and log cannot drift from its totals.
-- ---------------------------------------------------------------------
create table if not exists public.monthly_report_snapshots (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  month date not null,
  weekly_required_hours numeric not null default 0 check (weekly_required_hours >= 0),
  required_hours numeric not null default 0 check (required_hours >= 0),
  recorded_hours numeric not null default 0 check (recorded_hours >= 0),
  credited_hours numeric not null default 0 check (credited_hours >= 0),
  compliance_percent numeric not null default 0,
  status text not null check (status in ('compliant', 'needs_improvement', 'needs_attention', 'not_applicable')),
  days_recorded integer not null default 0 check (days_recorded >= 0),
  working_days integer not null default 0 check (working_days >= 0),
  missing_days integer not null default 0 check (missing_days >= 0),
  incomplete_records integer not null default 0 check (incomplete_records >= 0),
  daily jsonb not null default '[]'::jsonb,
  finalized_at timestamptz not null default now(),
  finalized_by uuid references public.profiles(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  primary key (employee_id, month)
);

-- A month's report is read in full; a person's history is read by id.
create index if not exists monthly_report_snapshots_month_idx
  on public.monthly_report_snapshots (month);

alter table public.monthly_report_snapshots enable row level security;

do $$
begin
  create policy "Heads can view all monthly snapshots"
    on public.monthly_report_snapshots for select
    using (public.is_admin());
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Users can view their own monthly snapshots"
    on public.monthly_report_snapshots for select
    using (auth.uid() = employee_id);
exception
  when duplicate_object then null;
end
$$;

-- Deliberately NO insert/update/delete policy: the only writer is the
-- security-definer function below, so a finalized report cannot be
-- tampered with from the browser. Corrections go through a
-- re-finalization, which is versioned and audited.

-- ---------------------------------------------------------------------
-- 2. FINALIZE — recompute one closed month for every eligible person
--    (Staff only) and upsert it. Idempotent: the ON CONFLICT
--    bumps `version` instead of inserting a duplicate row, so repeated
--    runs, retries and concurrent callers all converge on one snapshot.
--
--    Guarded to the current month: a month still in progress is
--    provisional by definition and is never finalized here.
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
  -- Auth: real sessions must be admin-class. A scheduled job (pg_cron)
  -- runs without auth.uid(), which is the only other allowed caller.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if v_month >= v_current_month then
    raise exception 'Only completed months can be finalized';
  end if;

  with eligible as (
    -- Only Staff carry a weekly requirement; Heads are out of scope for
    -- attendance compliance reports.
    select id, coalesce(required_weekly_hours, 0) as weekly
      from public.profiles
     where role = 'staff'
  ),
  working_days as (
    select count(*)::integer as day_count
      from generate_series(v_month, (v_next_month - interval '1 day')::date, interval '1 day') d
     where extract(isodow from d) < 6
  ),
  approved as (
    -- An approved output is status 'done' under the existing workflow.
    select distinct employee_id, date
      from public.outputs
     where status = 'done'
       and date >= v_month
       and date < v_next_month
  ),
  output_states as (
    -- Per day: the strongest output state, so the details drawer can
    -- say "Output approved" / "Output pending" / "No approved output"
    -- / "No output" for a closed month without re-reading outputs.
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
      (a.employee_id is not null) as has_approved_output,
      coalesce(os.output_status, 'none') as output_status
    from public.attendance_days ad
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
          'has_approved_output', has_approved_output,
          'is_credited', has_approved_output and not has_open_session,
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
      round(sum(case when md.has_approved_output and not md.has_open_session then md.hours else 0 end)::numeric, 2) as credited_hours,
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
    -- Versioned, never duplicated: a re-finalization is an audited
    -- correction rather than a silent rewrite.
    version               = monthly_report_snapshots.version + 1;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. OPTIONAL AUTOMATION
--    The project has no background job runner, so finalization also
--    happens on demand when a Head opens a closed month. If you
--    want it scheduled instead, enable pg_cron (Database → Extensions)
--    and uncomment:
--
--    select cron.schedule(
--      'finalize-monthly-reports',
--      '0 16 1 * *',   -- 16:00 UTC on the 1st, after the month has closed
--      $$ select public.finalize_month(
--           (date_trunc('month', (now() at time zone public.app_timezone())::date)
--            - interval '1 month')::date) $$
--    );
-- ---------------------------------------------------------------------
