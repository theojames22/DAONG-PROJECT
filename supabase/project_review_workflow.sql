-- =====================================================================
-- PROJECT REVIEW WORKFLOW MIGRATION — adds the "checking" status and
-- hardens output inserts.
-- Run this in Supabase → SQL Editor → New query → paste → Run.
--
-- Re-runnable and non-destructive to DATA. See "WHAT THE DESTRUCTIVE-
-- LOOKING PARTS ACTUALLY DO" below — you may see a Supabase warning
-- about destructive operations; it is a keyword match on `drop
-- constraint` / `drop policy`, which are the only ways to replace a
-- constraint or a policy in PostgreSQL. No table, column, or row is
-- ever dropped, and no row is read, written, or deleted.
--
-- WHAT THIS DOES
--   1. projects.status gains a third review state, 'checking' — the
--      state between 'pending' and the final Approve/Reject decision.
--   2. outputs insert RLS is tightened to status = 'pending', mirroring
--      the projects policy, so an employee cannot self-mark an output
--      approved at insert time.
--
-- WHAT IT DOES NOT TOUCH
--   • Every existing row in every table (projects, outputs, profiles,
--     sessions, notifications) — no data changes, no rewrites.
--   • The `outputs` table itself stays in place: attendance presence,
--     the employee audit trail, and the telemetry route still read it.
--   • FKs, indexes, triggers and notification functions are unchanged.
--
-- WHAT THE DESTRUCTIVE-LOOKING PARTS ACTUALLY DO
--   • `alter table ... drop constraint` on the CHECK that guards
--     projects.status. A CHECK is metadata, not data — dropping it
--     changes nothing about stored rows, and the extended CHECK is
--     added back in the same statement block (atomic; if anything
--     fails, the block rolls back). The new list is a strict SUPERSET
--     of the old one ('pending', 'approved', 'rejected' + 'checking'),
--     so re-adding it can never reject an existing row.
--   • `drop policy` on the outputs insert policy. Policies are metadata;
--     the replacement is the old policy plus `status = 'pending'`. RLS
--     applies to future inserts only, so existing rows are unaffected.
--
-- The script prints a `NOTICE` for every object it touches, so the
-- results panel tells you exactly what happened. Running it twice is
-- safe: the second run detects the already-correct constraint, leaves
-- it alone, and recreates the identical policy.
-- =====================================================================

do $$
declare
  r record;
  v_has_check boolean;
begin
  -- -----------------------------------------------------------------
  -- 1. PROJECTS — allow 'checking' alongside 'pending', 'approved'
  --    and 'rejected'.
  --
  --    Only single-column CHECK constraints whose column is exactly
  --    `status` are considered, so a composite check (if one ever
  --    exists) is left untouched. A constraint that already allows
  --    'checking' is left in place, which makes re-runs a no-op.
  -- -----------------------------------------------------------------
  for r in
    select con.conname,
           pg_get_constraintdef(con.oid) as definition
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
     where con.conrelid = 'public.projects'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'status'
       and not att.attisdropped
  loop
    if r.definition ilike '%checking%' then
      raise notice 'projects.status check "%" already allows checking — left as-is',
        r.conname;
    else
      raise notice 'replacing projects.status check "%": %', r.conname, r.definition;
      execute format('alter table public.projects drop constraint %I', r.conname);
    end if;
  end loop;

  -- Add the extended constraint only if the column now has none.
  select exists (
    select 1
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
     where con.conrelid = 'public.projects'::regclass
       and con.contype = 'c'
       and array_length(con.conkey, 1) = 1
       and att.attname = 'status'
       and not att.attisdropped
  ) into v_has_check;

  if not v_has_check then
    execute $inner$alter table public.projects
      add constraint projects_status_check
      check (status in ('pending', 'checking', 'approved', 'rejected'))$inner$;
    raise notice 'added projects_status_check: pending | checking | approved | rejected';
  end if;

  -- -----------------------------------------------------------------
  -- 2. OUTPUTS — employees may only insert their own rows, and only
  --    as 'pending'. Status changes are the review flow's job, never
  --    the submitter's. The app only ever inserts 'pending', so no
  --    current behaviour changes.
  -- -----------------------------------------------------------------
  drop policy if exists "Users can insert their own outputs" on public.outputs;
  create policy "Users can insert their own outputs"
    on public.outputs for insert
    with check (auth.uid() = employee_id and status = 'pending');
  raise notice 'outputs insert policy now requires: own row AND status = ''pending''';

  raise notice 'project_review_workflow: complete';
end $$;

-- =====================================================================
-- VERIFY AFTER RUNNING (read-only — safe to run any time)
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.projects'::regclass and contype = 'c';
--   -- expect: CHECK ((status)::text = ANY
--   --          (ARRAY['pending','checking','approved','rejected']))
--
--   select policyname, with_check
--     from pg_policies
--    where tablename = 'outputs' and cmd = 'INSERT';
--   -- expect: with_check mentions status = 'pending'
-- =====================================================================
