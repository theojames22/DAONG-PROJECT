-- =====================================================================
-- WRITTEN OUTPUT MIGRATION — the fourth submission type, stored as text.
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Run it LAST, after: schema.sql, admin_dashboard.sql, attendance_qr.sql,
-- output_uploads.sql, fix_output_dates.sql, mirror_outputs_to_projects.sql,
-- project_review_workflow.sql, credited_hours.sql.
--
-- WHAT THIS DOES
--   1. outputs.content          → the written submission body (plain text).
--   2. outputs.submission_notes → the staff member's note to the reviewer.
--      Reviewer feedback stays in outputs.reviewer_notes, which until now
--      was being used for BOTH jobs and overwritten on every decision.
--   3. outputs.reviewed_at      → when the current decision was recorded.
--   4. Relaxes the two NOT NULL url columns so a written submission does
--      not have to store a meaningless '' URL.
--   5. Widens attachment_type with 'written' and adds integrity checks.
--   6. Updates the mirror + sync triggers for the new columns.
--   7. Adds a guard so an approved/rejected decision can only be changed
--      by reopening it to 'checking' first (the authorized reversal).
--   8. Caps the storage provider itself (size + MIME) for new uploads.
--
-- WHAT IT DOES NOT DO
--   • No table, column, row, or object is dropped or deleted.
--   • No existing output is rewritten, converted, or re-uploaded.
--   • No attendance rule, credit formula, or threshold is touched.
--   • Existing attachments, statuses, reviewers and notes stay as stored.
--
-- Re-runnable: every DDL is guarded or ends in the same state.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NEW COLUMNS
-- ---------------------------------------------------------------------
alter table public.outputs
  add column if not exists content text,
  add column if not exists submission_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists file_mime_type text,
  add column if not exists file_size bigint;

-- Size metadata can never be negative. Separate statement so re-runs that
-- skip the column still converge on the constraint.
alter table public.outputs drop constraint if exists outputs_file_size_check;
alter table public.outputs
  add constraint outputs_file_size_check
  check (file_size is null or file_size >= 0) not valid;

-- ---------------------------------------------------------------------
-- 2. RELAX THE URL COLUMNS.
--    Dropping NOT NULL is metadata-only: no row changes, and every
--    existing row already has a value.
-- ---------------------------------------------------------------------
alter table public.outputs  alter column attachment_url drop not null;
alter table public.projects alter column file_url       drop not null;

-- ---------------------------------------------------------------------
-- 3. attachment_type gains 'written'.
--    Same guarded pattern as the earlier migrations: only a single-column
--    CHECK on attachment_type that does not yet know 'written' is
--    replaced, so re-runs are a no-op.
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
       and att.attname = 'attachment_type'
       and not att.attisdropped
       and pg_get_constraintdef(con.oid) not ilike '%written%'
  loop
    raise notice 'replacing outputs.attachment_type check "%": %',
      r.conname, r.definition;
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
       and att.attname = 'attachment_type'
       and not att.attisdropped
  ) then
    execute $inner$alter table public.outputs
      add constraint outputs_attachment_type_check
      check (attachment_type in ('file', 'link', 'image', 'written'))$inner$;
    raise notice 'added outputs_attachment_type_check: file | link | image | written';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. INTEGRITY CHECKS.
--    Added NOT VALID: they are enforced on every new row and every
--    update from this point on, but historical rows are never re-scanned
--    and therefore can never be rejected or rewritten by this migration.
--
--    The payload rule only constrains 'written'. Non-written rows keep
--    their historical shape untouched; the API/UI still require a URL
--    for file, image and link.
-- ---------------------------------------------------------------------
alter table public.outputs drop constraint if exists outputs_content_len_check;
alter table public.outputs
  add constraint outputs_content_len_check
  check (content is null or char_length(content) <= 20000) not valid;

alter table public.outputs drop constraint if exists outputs_submission_notes_len_check;
alter table public.outputs
  add constraint outputs_submission_notes_len_check
  check (submission_notes is null or char_length(submission_notes) <= 2000) not valid;

alter table public.outputs drop constraint if exists outputs_type_payload_check;
alter table public.outputs
  add constraint outputs_type_payload_check
  check (
    attachment_type <> 'written'
    or (
      content is not null
      and btrim(content) <> ''
      and attachment_url is null
    )
  ) not valid;

-- Best-effort validation of the historical rows. A failure here is not
-- fatal: the constraint still guards everything written from now on.
do $$
begin
  begin
    alter table public.outputs validate constraint outputs_content_len_check;
  exception when others then
    raise notice 'outputs_content_len_check left NOT VALID (legacy row exceeds it)';
  end;
  begin
    alter table public.outputs validate constraint outputs_submission_notes_len_check;
  exception when others then
    raise notice 'outputs_submission_notes_len_check left NOT VALID';
  end;
  begin
    alter table public.outputs validate constraint outputs_type_payload_check;
  exception when others then
    raise notice 'outputs_type_payload_check left NOT VALID';
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5. MIRROR TRIGGER — carry the staff note into the review card.
--    projects.description is the "notes from the submitter" slot the Head
--    UI already renders. submission_notes is the new home for it; the
--    reviewer_notes fallback keeps legacy pending submissions readable.
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
    coalesce(new.submission_notes, new.reviewer_notes),
    new.attachment_url,
    'pending',
    new.employee_id,
    new.id
  );
  return new;
end;
$$;

-- The trigger may already exist from mirror_outputs_to_projects.sql;
-- recreating it keeps this file runnable on its own and after a reset.
drop trigger if exists on_output_submitted_mirror on public.outputs;
create trigger on_output_submitted_mirror
  after insert on public.outputs
  for each row execute procedure public.mirror_output_to_project();

-- ---------------------------------------------------------------------
-- 6. SYNC TRIGGER — also stamp reviewed_at with the decision time.
--    Everything else is unchanged: approved→done, checking→checking,
--    rejected→rejected, reviewer carried across.
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
           reviewed_by = coalesce(new.reviewed_by, reviewed_by),
           reviewed_at = now()
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
-- 7. FINAL-DECISION GUARD.
--    A decision that is already final cannot be flipped straight to the
--    other final state. The Head reopens it to 'checking' first, which is
--    the authorized correction path, and only then decides again.
--    (Before this migration the UI allowed approved → rejected directly.)
-- ---------------------------------------------------------------------
create or replace function public.guard_final_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('approved', 'rejected')
     and new.status in ('approved', 'rejected')
     and new.status is distinct from old.status then
    raise exception
      'Reopen the submission to "checking" before changing a final decision'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists on_project_guard_final_decision on public.projects;
create trigger on_project_guard_final_decision
  before update on public.projects
  for each row execute procedure public.guard_final_decision();

-- ---------------------------------------------------------------------
-- 8. STORAGE PROVIDER LIMITS — enforced by Supabase Storage itself, not
--    just the browser, so a crafted client cannot exceed them.
--    Existing objects are not touched; this applies to new uploads.
-- ---------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 52428800, -- 50 MB, matching the UI
       allowed_mime_types = array[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/zip',
         'application/x-zip-compressed',
         'text/plain',
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif'
       ]
 where id = 'project-files';

-- =====================================================================
-- VERIFY AFTER RUNNING (read-only — safe to run any time)
--
--   -- 1. the new type is accepted and the payload rule exists:
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.outputs'::regclass and contype = 'c';
--   -- expect: attachment_type includes 'written', plus
--   --         outputs_content_len_check / outputs_type_payload_check
--
--   -- 2. every output still has exactly one review entry:
--   select count(*) as outputs_without_project
--     from public.outputs o
--    where not exists (select 1 from public.projects p
--                       where p.source_output_id = o.id);
--   -- expect: 0
--
--   -- 3. written rows are well formed:
--   select count(*) from public.outputs
--    where attachment_type = 'written'
--      and (content is null or btrim(content) = '' or attachment_url is not null);
--   -- expect: 0
--
--   -- 4. nothing historical was rewritten:
--   select attachment_type, count(*)
--     from public.outputs group by 1 order by 1;
--   -- expect: the same counts as before the migration
--
--   -- 5. decisions are guarded:
--   --   update public.projects set status = 'rejected'
--   --    where status = 'approved' limit 1;
--   -- expect: ERROR "Reopen the submission to checking before changing..."
-- =====================================================================
