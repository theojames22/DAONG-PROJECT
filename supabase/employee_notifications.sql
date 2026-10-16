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
--    reviewed_by is written by the admin tooling that updates the row
--    (see project_review_workflow.sql), so the notification can name the
--    approver; coalesce keeps the trigger safe even if a legacy row
--    updates without a reviewer set.
--    Stays quiet while the project-sync trigger from
--    mirror_outputs_to_projects.sql is driving the change (the projects
--    trigger already announced it) — one decision, one notification.
--    Kept identical in both files: mirror_outputs_to_projects.sql.
-- ---------------------------------------------------------------------
create or replace function public.notify_employee_on_output_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text;
  v_project_id uuid;
begin
  if new.status is distinct from old.status then
    -- Driven by the project sync trigger: the projects trigger already
    -- told the employee about this decision.
    if pg_trigger_depth() > 1 then
      return new;
    end if;

    select coalesce(full_name, 'Your administrator')
      into v_reviewer
      from public.profiles
     where id = coalesce(new.reviewed_by, new.employee_id);

    -- Thread the alert to the project discussion when this output has a
    -- mirrored review entry.
    select id into v_project_id
      from public.projects
     where source_output_id = new.id;

    if new.status in ('done', 'checking', 'rejected') then
      insert into public.notifications (sender_id, receiver_id, message, project_id)
      values (
        coalesce(new.reviewed_by, new.employee_id),
        new.employee_id,
        'Your output "' || coalesce(new.title, 'deliverable') || '"'
          || case new.status
               when 'done' then ' was approved by '
               when 'rejected' then ' was rejected by '
               else ' is now being checked by '
             end
          || v_reviewer,
        v_project_id
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
--    the notification is threaded to the project discussion. Announces
--    'checking' as well as the final decision, so marking a project
--    Checking tells the employee exactly like the output flow does.
--    Kept identical in both files: mirror_outputs_to_projects.sql.
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
     and new.status in ('checking', 'approved', 'rejected') then
    select coalesce(full_name, 'Your administrator')
      into v_reviewer
      from public.profiles
     where id = coalesce(new.reviewed_by, new.submitted_by);

    insert into public.notifications (sender_id, receiver_id, message, project_id)
    values (
      coalesce(new.reviewed_by, new.submitted_by),
      new.submitted_by,
      'Your project "' || coalesce(new.title, 'project') || '" was '
        || case new.status
             when 'approved' then 'approved'
             when 'rejected' then 'rejected'
             else 'moved to checking'
           end
        || ' by ' || v_reviewer,
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
-- 3. HEAD RECIPIENTS — employees can see which Heads to message.
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
   where p.role = 'head';
$$;

-- =====================================================================
-- FLOW (employee side)
--   • Admin approves an output / project → trigger fires → employee's bell
--     lights up in real time: "…was approved by <name>"
--   • Employee opens the bell → reads, marks read, replies straight back
--   • Employee clicks "Message administrator" → picks an admin → sends
--   • Admin's bell shows the employee's message, threaded to the output
-- =====================================================================
