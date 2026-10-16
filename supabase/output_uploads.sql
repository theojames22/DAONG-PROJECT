-- =====================================================================
-- OUTPUT UPLOADS MIGRATION — real file/screenshot submissions
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Re-runnable: guarded with `if not exists`. Purely additive — no drops.
--
-- Extends the existing `outputs` table (the deliverable/task record that
-- the admin Attendance page, the admin dashboard, the employee audit
-- trail and the telemetry route already read) so
-- file and screenshot submissions can store their real upload:
--
--   outputs.employee_id  → profiles.id   (FK, already exists)
--   outputs.reviewed_by  → profiles.id   (FK, already exists)
--   outputs.attachment_type           → 'link' | 'file' | 'image'
--   outputs.attachment_url            → public URL (link or storage URL)
--   outputs.storage_path              → NEW: object path in the
--                                       'project-files' bucket
--   outputs.file_name                 → NEW: original filename
--
-- NOTE: the 'project-files' bucket and its storage policies already come
-- from attendance_qr.sql — nothing to re-create here.
-- =====================================================================

alter table public.outputs
  add column if not exists storage_path text,
  add column if not exists file_name text;

-- =====================================================================
-- SUBMISSION FLOW
--   1. Employee picks a tab: Link URL / Document / File / Screenshot
--   2. Link        → saves attachment_url only
--      File/Image  → uploads to project-files/{employee_id}/deliverables/…
--                     then saves public URL + storage_path + file_name
--   3. Row lands in `outputs` with status 'pending' and today's date —
--      it feeds attendance presence, the employee audit trail, the
--      telemetry route, and the admin Attendance page
-- =====================================================================
