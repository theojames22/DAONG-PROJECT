-- =====================================================================
-- EMPLOYEE NOTIFICATIONS MIGRATION
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Requires admin_dashboard.sql (the notifications table) to be run first.
-- Re-runnable and purely additive — no DROP statements, so Supabase
-- won't raise its "destructive operations" warning.
--
-- Adds:
--   1. approval alerts — employees get notified when an output or project
--      is approved/rejected, including WHO approved it
--   2. get_admin_recipients() — lets an employee message an admin without
--      exposing any other profile data
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OUTPUT APPROVAL ALERTS — fires when the review status changes.
--    reviewed_by is written by the review UI (see ReviewList), so the
--    notification can name the approver; coalesce keeps the trigger safe
--    even if a legacy row updates without a reviewer set.
-- ---------------------------------------------------------------------
create or replace function public.notify_employee_on_output_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text;
begin
  if new.status is distinct from old.status then
    select coalesce(full_name, 'Your administrator')
      into v_reviewer
      from public.profiles
     where id = coalesce(new.reviewed_by, new.employee_id);

    if new.status = 'done' then
      insert into public.notifications (sender_id, receiver_id, message)
      values (
        coalesce(new.reviewed_by, new.employee_id),
        new.employee_id,
        'Your output "' || coalesce(new.title, 'deliverable')
          || '" was approved by ' || v_reviewer
      );
    elsif new.status = 'checking' then
      insert into public.notifications (sender_id, receiver_id, message)
      values (
        coalesce(new.reviewed_by, new.employee_id),
        new.employee_id,
        'Your output "' || coalesce(new.title, 'deliverable')
          || '" is now being checked by ' || v_reviewer
      );
    end if;
  end if;
  return new;
end;
$$;

-- Create the trigger only if it doesn't already exist (no DROP needed).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_output_reviewed'
      and tgrelid = 'public.outputs'::regclass
      and not tgisinternal
  ) then
    create trigger on_output_reviewed
      after update on public.outputs
      for each row execute procedure public.notify_employee_on_output_review();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. PROJECT APPROVAL ALERTS — same idea, deep-linked via project_id so
--    the notification is threaded to the project discussion.
-- ---------------------------------------------------------------------
create or replace function public.notify_employee_on_project_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text;
begin
  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected') then
    select coalesce(full_name, 'Your administrator')
      into v_reviewer
      from public.profiles
     where id = coalesce(new.reviewed_by, new.submitted_by);

    insert into public.notifications (sender_id, receiver_id, message, project_id)
    values (
      coalesce(new.reviewed_by, new.submitted_by),
      new.submitted_by,
      'Your project "' || coalesce(new.title, 'project') || '" was '
        || new.status || ' by ' || v_reviewer,
      new.id
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_project_reviewed'
      and tgrelid = 'public.projects'::regclass
      and not tgisinternal
  ) then
    create trigger on_project_reviewed
      after update on public.projects
      for each row execute procedure public.notify_employee_on_project_review();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. ADMIN RECIPIENTS — employees can see which admins to message.
--    Returns only id/name/position; open to any signed-in user because
--    the result set is tiny and non-sensitive.
-- ---------------------------------------------------------------------
create or replace function public.get_admin_recipients()
returns table (id uuid, full_name text, "position" text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.position
    from public.profiles p
   where p.role = 'admin';
$$;

-- =====================================================================
-- FLOW (employee side)
--   • Admin approves an output / project → trigger fires → employee's bell
--     lights up in real time: "…was approved by <name>"
--   • Employee opens the bell → reads, marks read, replies straight back
--   • Employee clicks "Message administrator" → picks an admin → sends
--   • Admin's bell shows the employee's message, threaded to the output
-- =====================================================================
