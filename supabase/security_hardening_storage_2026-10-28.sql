-- =====================================================================
-- PRIVATE PROJECT-FILES STORAGE — 2026-10-28
--
-- STEP 3 of the hardening rollout. Do NOT run this before the app code
-- that serves files through:
--   /api/outputs/[id]/file
--   /api/projects/[id]/file
-- is deployed and verified. Before that deploy, existing previews use
-- the old public object URLs.
--
-- Rollout order:
--   1. Run security_hardening_2026-10-28.sql (core auth/RPC/report rules)
--   2. Deploy the application
--   3. Verify owner + Head downloads against the still-public bucket
--   4. Run THIS file
--   5. Verify an old public URL now fails and the authenticated routes work
--
-- This file is data-preserving: it changes bucket visibility and removes
-- browser read/write policies. No object is deleted. All uploads and reads
-- go through validated server routes using the service role, so a Staff
-- member cannot overwrite or directly fetch a stored deliverable.
-- =====================================================================

begin;

update storage.buckets
   set public = false,
       file_size_limit = 52428800,
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

-- No browser-facing SELECT policy is created for project-files. The
-- authenticated routes in app/api/outputs/[id]/file and
-- app/api/projects/[id]/file perform the row-level authorization first, then
-- stream the object with the service role. Removing direct Storage reads
-- also prevents a legacy HTML/SVG object from bypassing the routes' MIME and
-- Content-Disposition hardening.
drop policy if exists "Public read project files" on storage.objects;
drop policy if exists "Owners read project files" on storage.objects;
drop policy if exists "Heads read project files" on storage.objects;

-- The application is now the only writer: /api/outputs authenticates,
-- validates, then uploads with the service-role client. Direct browser
-- insert/update would let a Staff member replace an attachment after it was
-- reviewed, so those policies are removed rather than narrowed.
drop policy if exists "Users upload own project files" on storage.objects;
drop policy if exists "Users update own project files" on storage.objects;

commit;

-- =====================================================================
-- POST-MIGRATION VERIFICATION
-- 1. Bucket visibility:
--      select id, public from storage.buckets where id = 'project-files';
--    Expected: public = false.
-- 2. Legacy public object URL must return 400/403.
-- 3. A signed-in Staff/Head direct Storage read of a project-files object must
--    be denied; /api/outputs/<id>/file must still return the file.
-- 4. As a Head, /api/projects/<id>/file must return a mirrored deliverable.
-- 5. As another Staff member, the same file route must return 404.
-- =====================================================================
