-- =====================================================================
-- SECURITY / INTEGRITY HARDENING — 2026-10-28
--
-- Run this in Supabase → SQL Editor after taking a backup/PITR snapshot.
-- It is additive and data-preserving: no attendance, output, project,
-- profile or storage rows are deleted.
--
-- It closes four critical paths:
--   1. Public signup could assign the "head" role from user metadata.
--   2. Staff could update privileged profile columns on their own row.
--   3. Staff could write arbitrary attendance sessions directly.
--   4. Anonymous callers could reach report/finalization helper functions.
--
-- This file is the CORE hardening step. It deliberately leaves the
-- project-files bucket public so it can be applied before the app deploy.
-- Run supabase/security_hardening_storage_2026-10-28.sql only after the
-- authenticated file routes are live.
--
-- The function grants at the end assume PostgreSQL's default EXECUTE
-- privilege to PUBLIC. They are explicit so the live project is covered
-- even if that default was changed manually.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. SIGNUP — never trust user-supplied metadata for role/position.
--    Heads are only assigned by the server-side Head employee route,
--    which uses the service-role client after this trigger runs.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Public sign-up is not part of this product: Heads create accounts from
  -- the employee page. Supabase's admin createUser({ email_confirm: true })
  -- has a confirmation timestamp at insert time; a public signup does not
  -- (the live project has mailer_autoconfirm=false). This prevents direct
  -- /auth/v1/signup calls even if the dashboard setting is missed.
  if new.email_confirmed_at is null then
    raise exception
      'Public sign-up is disabled. Ask a Head to create your account.'
      using errcode = '42501';
  end if;

  insert into public.profiles (
    id,
    full_name,
    role,
    email,
    position,
    required_weekly_hours
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    'staff',
    new.email,
    null,
    40
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. PROFILE PRIVILEGES — RLS allows a user to update their own row,
--    which is correct for name/avatar/theme. These columns are not.
--    The trigger is the authoritative guard; the app also removes the
--    position editor for Staff.
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role, migration/SQL editor context and Heads are allowed.
  if auth.role() is null
     or auth.role() = 'service_role'
     or public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.position is distinct from old.position
     or new.required_weekly_hours is distinct from old.required_weekly_hours
     or new.email is distinct from old.email
     or new.qr_token is distinct from old.qr_token
     or new.created_at is distinct from old.created_at then
    raise exception
      'This profile field is managed by a Head and cannot be changed here'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_guard_privileges on public.profiles;
create trigger on_profile_guard_privileges
  before update on public.profiles
  for each row execute procedure public.guard_profile_privileges();

-- Heads never carry a weekly requirement.
update public.profiles
   set required_weekly_hours = 0
 where role = 'head'
   and required_weekly_hours is distinct from 0;

-- Database-level invariants that must hold even for service-role writes:
--   • a Head always has 0 required hours
--   • the final Head cannot be demoted (serialized so two concurrent
--     demotions cannot both pass the count check)
create or replace function public.enforce_profile_invariants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'head' then
    new.required_weekly_hours := 0;
  elsif new.required_weekly_hours < 0 or new.required_weekly_hours > 168 then
    raise exception 'Required weekly hours must be between 0 and 168'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.role = 'head'
     and new.role is distinct from 'head' then
    perform pg_advisory_xact_lock(hashtext('public.profiles.last_head')::bigint);

    if not exists (
      select 1
        from public.profiles
       where role = 'head'
         and id is distinct from old.id
    ) then
      raise exception 'At least one Head account must remain'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_invariants on public.profiles;
create trigger on_profile_invariants
  before insert or update on public.profiles
  for each row execute procedure public.enforce_profile_invariants();

-- ---------------------------------------------------------------------
-- 3. ATTENDANCE — remove direct client writes. Time is server time;
--    identity is auth.uid(); only Staff may clock in.
-- ---------------------------------------------------------------------
drop policy if exists "Users can insert their own sessions" on public.sessions;
drop policy if exists "Users can update their own open session" on public.sessions;
drop policy if exists "Heads can update any session" on public.sessions;

create or replace function public.guard_session_times()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.time_out is not null and new.time_out <= new.time_in then
    raise exception 'A session must end after it starts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists on_session_guard_times on public.sessions;
create trigger on_session_guard_times
  before insert or update on public.sessions
  for each row execute procedure public.guard_session_times();

create or replace function public.clock_in()
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_session public.sessions;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Lock the profile row so two tabs/devices cannot both create an open
  -- session at the same instant.
  select role into v_role
    from public.profiles
   where id = auth.uid()
   for update;

  if v_role is distinct from 'staff' then
    raise exception 'Only Staff can clock in or out' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.sessions
     where employee_id = auth.uid()
       and time_out is null
  ) then
    raise exception 'You already have an open session'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.sessions
     where employee_id = auth.uid()
       and tstzrange(time_in, coalesce(time_out, 'infinity'::timestamptz), '[)')
           && tstzrange(now(), 'infinity'::timestamptz, '[)')
  ) then
    raise exception 'This clock-in overlaps an existing session'
      using errcode = '23P01';
  end if;

  insert into public.sessions (employee_id, time_in)
  values (auth.uid(), now())
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.clock_out()
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_session public.sessions;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select role into v_role
    from public.profiles
   where id = auth.uid()
   for update;

  if v_role is distinct from 'staff' then
    raise exception 'Only Staff can clock in or out' using errcode = '42501';
  end if;

  select * into v_session
    from public.sessions
   where employee_id = auth.uid()
     and time_out is null
   order by time_in desc
   limit 1
   for update;

  if not found then
    raise exception 'There is no open session to clock out'
      using errcode = 'P0001';
  end if;

  update public.sessions
     set time_out = now()
   where id = v_session.id
     and time_out is null
  returning * into v_session;

  if not found then
    raise exception 'The open session changed; refresh and try again'
      using errcode = '40001';
  end if;

  return v_session;
end;
$$;

-- Keep the QR/admin path consistent with the same rules.
create or replace function public.admin_toggle_attendance(
  p_employee_id uuid,
  p_open_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Head access required' using errcode = '42501';
  end if;

  if p_employee_id is null then
    raise exception 'Employee is required' using errcode = '22004';
  end if;

  -- Serialize against the employee's own clock-in and another scan.
  select role into v_role
    from public.profiles
   where id = p_employee_id
   for update;

  if v_role is distinct from 'staff' then
    raise exception 'Only Staff can clock in or out' using errcode = '42501';
  end if;

  if p_open_session_id is null then
    select id into v_session_id
      from public.sessions
     where employee_id = p_employee_id
       and time_out is null
     order by time_in desc
     limit 1;

    if v_session_id is not null then
      return jsonb_build_object(
        'action', 'already_open',
        'session_id', v_session_id
      );
    end if;

    insert into public.sessions (employee_id, time_in)
    values (p_employee_id, now())
    returning id into v_session_id;

    return jsonb_build_object('action', 'time_in', 'session_id', v_session_id);
  else
    update public.sessions
       set time_out = now()
     where id = p_open_session_id
       and employee_id = p_employee_id
       and time_out is null
    returning id into v_session_id;

    if v_session_id is null then
      return jsonb_build_object('action', 'not_open');
    end if;

    return jsonb_build_object('action', 'time_out', 'session_id', v_session_id);
  end if;
end;
$$;

-- Existing data may predate the RPC. Refuse to install the one-open-session
-- guarantee until an operator resolves duplicate open sessions manually; this
-- migration never closes or deletes attendance rows.
do $$
declare
  v_duplicates text;
begin
  select string_agg(employee_id::text || ' (' || open_count || ')', ', ')
    into v_duplicates
    from (
      select employee_id, count(*) as open_count
        from public.sessions
       where time_out is null
       group by employee_id
      having count(*) > 1
    ) duplicates;

  if v_duplicates is not null then
    raise exception
      'Duplicate open sessions must be resolved before hardening: %',
      v_duplicates;
  end if;
end;
$$;

-- Defense in depth: the RPC already serializes on the profile row, but the
-- database must also refuse a second open row from any future write path.
create unique index if not exists sessions_one_open_per_employee
  on public.sessions (employee_id)
  where time_out is null;

-- Add useful indexes without changing behavior.
create index if not exists outputs_employee_created_at_idx
  on public.outputs (employee_id, created_at desc);
create index if not exists outputs_date_idx
  on public.outputs (date);
create index if not exists sessions_time_in_idx
  on public.sessions (time_in);

-- Notifications: still self-sent, but a project thread may only reference a
-- project the sender can actually see. Without this, a guessed project UUID
-- could inject a message into someone else's approval thread.
drop policy if exists "Users can send notifications as themselves"
  on public.notifications;
create policy "Users can send notifications as themselves"
  on public.notifications for insert
  with check (
    auth.uid() = sender_id
    and (
      project_id is null
      or exists (
        select 1
          from public.projects p
         where p.id = project_id
           and (p.submitted_by = auth.uid() or public.is_admin())
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. OUTPUT SUBMISSION — the server endpoint is the only write path.
--    The database forces the fields a client must never control, and the
--    browser insert policy is removed. The endpoint already validates the
--    body; this is the defense-in-depth layer.
-- ---------------------------------------------------------------------
-- Written/link/file rows can legitimately have no public URL now that
-- attachments are streamed through an authenticated route.
alter table public.outputs alter column attachment_url drop not null;

create or replace function public.guard_output_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / migration context keeps whatever it supplies.
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  -- Heads may create review rows through their own workflow.
  if public.is_admin() then
    return new;
  end if;

  new.employee_id := auth.uid();
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.reviewer_notes := null;
  new.date := (now() at time zone public.app_timezone())::date;

  return new;
end;
$$;

drop trigger if exists on_output_guard_insert on public.outputs;
create trigger on_output_guard_insert
  before insert on public.outputs
  for each row execute procedure public.guard_output_insert();

-- Insertion now happens only in /api/outputs after authentication and
-- validation, using the service-role client. Removing the browser policy
-- makes that server route the single write path; the trigger above remains
-- as defense-in-depth if this policy is ever re-added.
drop policy if exists "Users can insert their own outputs" on public.outputs;

-- Project review rows are created by the mirror trigger (security definer)
-- or by service-role server code. A browser no longer needs a direct insert,
-- and a review row is not deletable from the browser.
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Heads can delete any project" on public.projects;

-- Review attribution is server/database-owned. The approval UI still sends
-- reviewed_by/reviewed_at, but those values are advisory; a Head can never
-- credit a decision to another account or backdate it. The submitted
-- artifact's ownership, date, attachment, and creation time are immutable
-- once the row exists, even for a Head.
create or replace function public.guard_project_review_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    return new;
  end if;

  new.id := old.id;
  new.title := old.title;
  new.description := old.description;
  new.file_url := old.file_url;
  new.submitted_by := old.submitted_by;
  new.source_output_id := old.source_output_id;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
  else
    new.reviewed_by := old.reviewed_by;
  end if;

  return new;
end;
$$;

drop trigger if exists on_project_guard_review_attribution on public.projects;
create trigger on_project_guard_review_attribution
  before update on public.projects
  for each row execute procedure public.guard_project_review_attribution();

create or replace function public.guard_output_review_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    return new;
  end if;

  -- The submitted artifact is immutable; only the review fields may change.
  new.id := old.id;
  new.employee_id := old.employee_id;
  new.date := old.date;
  new.title := old.title;
  new.attachment_type := old.attachment_type;
  new.attachment_url := old.attachment_url;
  new.content := old.content;
  new.submission_notes := old.submission_notes;
  new.storage_path := old.storage_path;
  new.file_name := old.file_name;
  new.file_mime_type := old.file_mime_type;
  new.file_size := old.file_size;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists on_output_guard_review_attribution on public.outputs;
create trigger on_output_guard_review_attribution
  before update on public.outputs
  for each row execute procedure public.guard_output_review_attribution();

-- The same reopen-before-flipping rule the project workflow uses also applies
-- to the mirrored output, so a direct PostgREST update cannot bypass it.
create or replace function public.guard_output_final_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('done', 'rejected')
     and new.status in ('done', 'rejected')
     and new.status is distinct from old.status then
    raise exception
      'Reopen the submission to "checking" before changing a final decision'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists on_output_guard_final_decision on public.outputs;
create trigger on_output_guard_final_decision
  before update on public.outputs
  for each row execute procedure public.guard_output_final_decision();

-- ---------------------------------------------------------------------
-- 5. REPORT FUNCTIONS — remove anonymous reachability.
--
--    PostgreSQL grants EXECUTE to PUBLIC by default, and the existing
--    finalize_month() guard treats auth.uid() IS NULL as a scheduler.
--    That made the raw function callable by anon. Keep the original as a
--    service/owner-only primitive and expose a Head-only wrapper.
-- ---------------------------------------------------------------------
revoke execute on function public.finalize_month(date) from public;
revoke execute on function public.finalize_month(date) from anon;
revoke execute on function public.finalize_month(date) from authenticated;
grant execute on function public.finalize_month(date) to service_role;

create or replace function public.finalize_month_head(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Head access required' using errcode = '42501';
  end if;

  return public.finalize_month(p_month);
end;
$$;

revoke execute on function public.finalize_month_head(date) from public;
revoke execute on function public.finalize_month_head(date) from anon;
grant execute on function public.finalize_month_head(date) to authenticated;
grant execute on function public.finalize_month_head(date) to service_role;

revoke execute on function public.refresh_attendance_day(uuid, date) from public;
revoke execute on function public.refresh_attendance_day(uuid, date) from anon;
revoke execute on function public.refresh_attendance_day(uuid, date) from authenticated;
grant execute on function public.refresh_attendance_day(uuid, date) to service_role;

revoke execute on function public.get_admin_recipients() from public;
revoke execute on function public.get_admin_recipients() from anon;
grant execute on function public.get_admin_recipients() to authenticated;
grant execute on function public.get_admin_recipients() to service_role;

revoke execute on function public.resolve_qr_token(text) from public;
revoke execute on function public.resolve_qr_token(text) from anon;
grant execute on function public.resolve_qr_token(text) to authenticated;
grant execute on function public.resolve_qr_token(text) to service_role;

revoke execute on function public.admin_toggle_attendance(uuid, uuid) from public;
revoke execute on function public.admin_toggle_attendance(uuid, uuid) from anon;
grant execute on function public.admin_toggle_attendance(uuid, uuid) to authenticated;
grant execute on function public.admin_toggle_attendance(uuid, uuid) to service_role;

revoke execute on function public.app_timezone() from public;
revoke execute on function public.app_timezone() from anon;
grant execute on function public.app_timezone() to authenticated;
grant execute on function public.app_timezone() to service_role;

revoke execute on function public.clock_in() from public;
revoke execute on function public.clock_in() from anon;
grant execute on function public.clock_in() to authenticated;
grant execute on function public.clock_in() to service_role;

revoke execute on function public.clock_out() from public;
revoke execute on function public.clock_out() from anon;
grant execute on function public.clock_out() to authenticated;
grant execute on function public.clock_out() to service_role;

-- These reporting views are for signed-in Head/Staff sessions only. RLS on
-- their base tables already returns no rows to anon, but remove the obsolete
-- anon grant from credit_submitted_days.sql as well.
revoke select on public.attendance_day_status from anon;
revoke select on public.employee_week_hours from anon;
revoke select on public.daily_hours from anon;

-- The avatars bucket stays public by design, but its upload limits are
-- enforced by Storage itself so a crafted client cannot store oversized or
-- executable content. The settings UI mirrors these limits.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array[
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif'
       ]
 where id = 'avatars';

-- ---------------------------------------------------------------------
-- 6. STORAGE is a separate migration:
--    supabase/security_hardening_storage_2026-10-28.sql
--    It flips project-files private, so it must run only after the
--    authenticated file routes are deployed and verified.
-- ---------------------------------------------------------------------

commit;

-- =====================================================================
-- POST-MIGRATION VERIFICATION (run as SQL, not as an anon client):
--   select public.clock_in();          -- as Staff only, should create one row
--   select public.clock_out();         -- as the same Staff
--   select public.finalize_month_head('2026-09-01'::date);
--   select public.finalize_month_head(current_date); -- must fail
-- =====================================================================
