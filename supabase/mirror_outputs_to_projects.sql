-- =====================================================================
-- MIRROR OUTPUTS INTO THE PROJECTS REVIEW QUEUE
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Run fix_output_dates.sql first (or together — order between the two
-- doesn't matter). Non-destructive to data: every statement is either a
-- metadata change (constraint/policy/trigger) or a guarded backfill.
--
-- WHY THIS EXISTS
--   Employee submissions live in `outputs`; the admin review interface
--   (Projects page → approval page with Approve/Reject/Checking/Download)
--   reads `projects`. After Output Review was removed, nothing ever
--   wrote a `projects` row, so the review queue stayed permanently empty
--   and submissions were invisible to the admin review flow.
--
-- WHAT IT DOES
--   1. Links the two tables: projects.source_output_id → outputs.id
--      (unique, cascade). One review entry per submission, no orphans
--      in either direction.
--   2. outputs.status gains 'rejected' so a rejected decision can be
--      stored honestly (approved maps to the existing 'done').
--   3. Refreshes the two employee-notification functions (see
--      employee_notifications.sql for the same definitions): the
--      projects function now also announces 'checking', and the outputs
--      function stays quiet while the sync trigger below is driving it,
--      so one decision produces exactly one notification.
--   4. Mirror trigger: every NEW output automatically becomes a
--      'pending' project (and the existing on_project_submitted trigger
--      notifies admins).
--   5. Sync trigger: every project decision writes back to its linked
--      output — approved→done, checking→checking, rejected→rejected —
--      so Attendance, the employee audit trail, and the dashboard
--      "outputs to review" count all follow the admin's decision.
--   6. Backfill: creates the missing review rows for outputs that
--      already exist, preserving their real status/reviewer/notes.
--      Admin alerts are switched off during the backfill so old
--      submissions don't spam the notification bell.
--
-- Re-runnable: every DDL is guarded, and the backfill skips rows that
-- are already linked or already mirrored.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LINK COLUMN — projects.source_output_id → outputs.id
-- ---------------------------------------------------------------------
alter table public.projects
  add column if not exists source_output_id uuid;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'projects_source_output_id_fkey'
       and conrelid = 'public.projects'::regclass
  ) then
    execute 'alter table public.projects drop constraint projects_source_output_id_fkey';
  end if;
end $$;

alter table public.projects
  add constraint projects_source_output_id_fkey
  foreign key (source_output_id)
  references public.outputs(id) on delete cascade;

create unique index if not exists projects_source_output_id_key
  on public.projects (source_output_id);

-- ---------------------------------------------------------------------
-- 2. outputs.status gains 'rejected'. Any existing single-column CHECK
--    on `status` that doesn't know 'rejected' is replaced; one that
--    already does is left alone, so re-runs don't churn.
-- ---------------------------------------------------------------------
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
       and pg_get_constraintdef(con.oid) not ilike '%rejected%'
  loop
    raise notice 'replacing outputs.status check "%": %', r.conname, r.definition;
    execute format('alter table public.outputs drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
     where con.conrelid = 'public.outputs'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'status'
       and not att.attisdropped
  ) then
    execute $inner$alter table public.outputs
      add constraint outputs_status_check
      check (status in ('pending', 'checking', 'done', 'rejected'))$inner$;
    raise notice 'added outputs_status_check: pending | checking | done | rejected';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. NOTIFICATION FUNCTIONS (identical to employee_notifications.sql)
--    - outputs: stays quiet when the sync trigger is driving the change
--      (the projects trigger already announced it), keeps the legacy
--      "approved"/"is now being checked" wording, adds "rejected", and
--      threads the alert to the project thread when one exists.
--    - projects: also announces 'checking', one decision = one message.
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

-- ---------------------------------------------------------------------
-- 4. MIRROR TRIGGER — new output → new pending project
--    Security definer so the insert clears RLS regardless of who
--    submitted; the row is always 'pending', which is all an employee's
--    own insert policy would allow anyway.
-- ---------------------------------------------------------------------
create or replace function public.mirror_output_to_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.projects (
    title, description, file_url, status,
    submitted_by, source_output_id
  )
  values (
    coalesce(new.title, 'Output ' || to_char(new.date, 'YYYY-MM-DD')),
    new.reviewer_notes,
    new.attachment_url,
    'pending',
    new.employee_id,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists on_output_submitted_mirror on public.outputs;
create trigger on_output_submitted_mirror
  after insert on public.outputs
  for each row execute procedure public.mirror_output_to_project();

-- ---------------------------------------------------------------------
-- 5. SYNC TRIGGER — project decision → linked output status
--    approved → done, checking → checking, rejected → rejected.
--    Updating the row fires on_output_reviewed, which stays quiet here
--    (trigger depth) because the projects trigger already notified.
-- ---------------------------------------------------------------------
create or replace function public.sync_output_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_output_id is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    update public.outputs
       set status = case new.status
                      when 'approved' then 'done'
                      when 'checking' then 'checking'
                      when 'rejected' then 'rejected'
                      else new.status::text
                    end,
           reviewed_by = coalesce(new.reviewed_by, reviewed_by)
     where id = new.source_output_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_project_reviewed_sync_output on public.projects;
create trigger on_project_reviewed_sync_output
  after update on public.projects
  for each row execute procedure public.sync_output_from_project();

-- ---------------------------------------------------------------------
-- 6. BACKFILL — review rows for outputs that already exist.
--    on_project_submitted is disabled so historical submissions don't
--    fire "submitted for approval" alerts at every admin. Statuses map
--    back onto the project equivalents (done→approved, etc.) so the
--    queue reflects reality.
-- ---------------------------------------------------------------------
alter table public.projects disable trigger on_project_submitted;

insert into public.projects (
  title, description, file_url, status,
  submitted_by, reviewed_by, reviewer_notes,
  created_at, updated_at, source_output_id
)
select
  coalesce(o.title, 'Output ' || to_char(o.date, 'YYYY-MM-DD')),
  o.reviewer_notes,
  o.attachment_url,
  case o.status
    when 'done' then 'approved'
    when 'checking' then 'checking'
    when 'rejected' then 'rejected'
    else 'pending'
  end,
  o.employee_id,
  o.reviewed_by,
  o.reviewer_notes,
  o.created_at,
  o.created_at,
  o.id
from public.outputs o
where not exists (
        select 1 from public.projects p
         where p.source_output_id = o.id
      )
  and not exists (
        select 1 from public.projects p2
         where p2.file_url = o.attachment_url
           and p2.submitted_by = o.employee_id
      );

alter table public.projects enable trigger on_project_submitted;

-- =====================================================================
-- VERIFY AFTER RUNNING (read-only)
--   -- every output should have exactly one linked project:
--   select
--     (select count(*) from outputs) as outputs,
--     (select count(*) from projects) as projects,
--     (select count(*) from outputs o
--       where not exists (select 1 from projects p
--                         where p.source_output_id = o.id)) as outputs_without_project;
--   -- expect: outputs_without_project = 0
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.outputs'::regclass and contype = 'c';
--   -- expect: status IN ('pending','checking','done','rejected')
--
--   select tgname from pg_trigger
--    where tgrelid in ('public.outputs'::regclass, 'public.projects'::regclass)
--      and not tgisinternal order by tgname;
--   -- expect to include: on_output_submitted_mirror, on_project_reviewed_sync_output
-- =====================================================================
