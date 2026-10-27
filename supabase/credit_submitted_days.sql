-- =====================================================================
-- CREDIT EVERY DAY THAT HAS A SUBMITTED OUTPUT
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Run it AFTER credited_hours.sql and reports.sql.
--
-- THE RULE CHANGE
--   Before: a day's attendance hours were credited only when that day's
--   output was APPROVED ('done'). Rejecting a submission took the credit
--   back, so a staff member who clocked in, did the work, and had it
--   rejected ended the week with zero credit for that day.
--
--   Now: a day's attendance hours are credited as soon as the employee
--   has SUBMITTED an output for that day — any review status counts,
--   including 'rejected'. Credit is about time worked and work handed in,
--   not about the reviewer's verdict. An open clock (no time-out) is
--   still excluded until it closes, and a day with no output at all is
--   still uncredited.
--
--   Concretely, `is_credited` changes from
--     (has approved output) and not has_open_session
--   to
--     (has any output)     and not has_open_session
--
-- WHAT THIS DOES
--   1. Recreates attendance_day_status with the new rule, and appends
--      `has_output` so callers can still tell "submitted" from "approved".
--      `has_approved_output` is kept and still means approved only.
--   2. Recreates employee_week_hours on top of it (same definition).
--   3. Replaces finalize_month() so closed-month snapshots use the same
--      rule for both their totals and their frozen per-day detail.
--
-- WHY DROP INSTEAD OF CREATE OR REPLACE
--   employee_week_hours depends on attendance_day_status, and this file
--   appends a column in a position a CREATE OR REPLACE would refuse on a
--   database that still has the older 7-column revision. Views hold no
--   data, so dropping and rebuilding both is lossless.
--
-- Re-runnable: both views are dropped first, and both functions use
-- CREATE OR REPLACE. Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PER-DAY CREDIT FLAG — any submitted output credits the day.
-- ---------------------------------------------------------------------
drop view if exists public.employee_week_hours;
drop view if exists public.attendance_day_status;

create view public.attendance_day_status
with (security_invoker = true) as
with submitted_days as (
  -- Every output counts, regardless of review status. Review status is
  -- for display only; it never gates the credit.
  select distinct employee_id, date
    from public.outputs
),
approved_days as (
  -- Kept separately so the UI can still label a day "output approved"
  -- without reinterpreting the credit flag.
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
  (s.employee_id is not null and not d.has_open_session) as is_credited,
  d.first_in,
  d.last_out,
  (s.employee_id is not null) as has_output
from public.attendance_days d
left join submitted_days s
  on s.employee_id = d.employee_id
 and s.date = d.date
left join approved_days a
  on a.employee_id = d.employee_id
 and a.date = d.date;

-- ---------------------------------------------------------------------
-- 2. PER-WEEK TOTALS — attendance hours (always) beside credited hours
--    (the part that counts toward the weekly requirement).
--    Definition unchanged: it derives from the view above, so this
--    migration is the only place the rule lives.
-- ---------------------------------------------------------------------
create view public.employee_week_hours
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

-- Dropping and recreating a view resets its grants; restore the same access
-- Supabase's defaults give them. security_invoker + RLS still decides rows.
grant select on public.attendance_day_status to anon, authenticated, service_role;
grant select on public.employee_week_hours to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. MONTHLY FINALIZATION — the frozen snapshot must use the same rule
--    as the live view, or a closed month would disagree with the week
--    card. `output_states` is unchanged: it still drives the per-day
--    chip (approved / pending / rejected / none).
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
  submitted as (
    -- Any output credits the day, whatever its review status. Rejected
    -- work still represents time the employee actually worked.
    select distinct employee_id, date
      from public.outputs
     where date >= v_month
       and date < v_next_month
  ),
  approved as (
    select distinct employee_id, date
      from public.outputs
     where status = 'done'
       and date >= v_month
       and date < v_next_month
  ),
  output_states as (
    -- Per day: the strongest output state, so the details drawer can
    -- say "Output approved" / "Output pending" / "Output rejected"
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
    -- Versioned, never duplicated: a re-finalization is an audited
    -- correction rather than a silent rewrite.
    version               = monthly_report_snapshots.version + 1;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

-- =====================================================================
-- VERIFY AFTER RUNNING (read-only — safe to run any time)
--
--   -- a rejected-only day must now report is_credited = true:
--   select employee_id, date, hours, has_output, has_approved_output, is_credited
--     from public.attendance_day_status
--    where date >= current_date - 30
--    order by date desc;
--
--   -- and its hours must appear in the weekly credit:
--   select employee_id, week_start, attendance_hours, credited_hours, credited_days
--     from public.employee_week_hours
--    order by week_start desc;
--
--   -- re-finalizing a closed month must use the same rule:
--   select public.finalize_month('2026-09-01');
--   select employee_id, credited_hours, version
--     from public.monthly_report_snapshots
--    where month = '2026-09-01';
-- =====================================================================
