# Daong — Attendance Tracker

Attendance, scheduling, output review, and compliance reporting for Daong.
Built with Next.js 15 (App Router), TypeScript, Tailwind CSS, and Supabase.

## Run locally

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase values
npm run dev
```

Open `http://localhost:3000`. Unauthenticated visitors to `/` are sent to
`/login`; signed-in users go to their role's dashboard.

For a production check:

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm start
```

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (also used by the browser client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS site URL for auth links and Secure auth cookies |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Head-created accounts, authenticated file streaming, and controlled cleanup |

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or prefix it with
`NEXT_PUBLIC_`.

## Roles and routing

There are exactly two roles, stored in `profiles.role`:

| Role | Dashboard | Clock in/out | QR code | Required hours |
|---|---|---|---|---|
| **Head** (`head`) | `/head` — team, attendance, reports, schedule, equipment, approvals | no | no | none (forced to 0) |
| **Staff** (`staff`) | `/employee` — clock in/out, outputs, personal schedule | yes | yes | weekly target |

`app/page.tsx` and `app/login/page.tsx` route by `role` (Head → `/head`,
Staff → `/employee`). `middleware.ts` requires a valid session for both
sections; each layout and API route re-checks the database role. Once the
hardening SQL below is applied, a client cannot grant itself Head access by
changing a URL, request field, token metadata, or its own profile row.

## Database setup

Run the SQL files in `supabase/` in the order documented by their headers.
For an existing project, take a backup/PITR snapshot first, then rollout in
this order. Use a short maintenance window: the core migration removes the
old direct attendance/output write policies, so the previous app version
must not keep serving traffic while it is applied.

0. **Before the window:** disable public sign-up in Supabase Auth and verify a
   direct `/auth/v1/signup` call is rejected. The live project currently has
   sign-up enabled; the database guard in step 2 is defense-in-depth and does
   not protect the project until it is applied. Head-created accounts use the
   admin API and are unaffected.
1. Put the app in maintenance/read-only mode (or accept the short window).
2. Run `supabase/security_hardening_2026-10-28.sql`. This adds the
   server-authoritative RPCs and report wrapper while leaving the storage
   bucket public.
3. Deploy the application code. Previews now use
   `/api/outputs/[id]/file` and `/api/projects/[id]/file`.
4. Verify owner and Head downloads work against the still-public bucket.
5. Run `supabase/security_hardening_storage_2026-10-28.sql`, which makes
   `project-files` private and removes all browser read/write access to it.
6. Verify an old public object URL no longer works and the authenticated
   routes still do.

The database signup guard in step 2 is not a substitute for the Auth setting.

If the maintenance window has to be delayed, apply
`supabase/security_hardening_emergency_2026-10-29.sql` first. It closes the
live signup and self-role-escalation paths and enforces Head invariants
without removing the old attendance/output policies. Normal display-name,
avatar, and theme edits still work; Head-managed fields are intentionally
blocked. It does **not** fix direct attendance/output writes, anonymous report
RPC reachability, or the public `project-files` bucket, so the full core and
storage migrations are still required.

## Security model

- Authorization is read from `profiles.role` server-side; client-supplied
  role, owner, approval, and timestamp fields are ignored.
- Attendance writes go through `clock_in()` / `clock_out()` RPCs, which use
  `auth.uid()`, database time, and a row lock to prevent duplicate open
  sessions. Heads cannot clock in.
- Output writes go through `/api/outputs`, which validates the type, size,
  MIME type, URL scheme, title, and body before a service-role upload and
  insert. Browser writes to `project-files` are disabled by the storage
  migration, so reviewed attachments cannot be replaced directly.
- Private deliverables are streamed only after the output/project row passes
  RLS for the signed-in user. `project-files` has no browser read or write
  policy after the storage migration; only the service-role routes touch it.
- Review decisions are Head-only. Project `reviewed_by` and output
  `reviewed_by`/`reviewed_at` attribution is overwritten with `auth.uid()`
  and database time, so the client cannot credit or backdate a decision.
  Submitted ownership, date, attachment metadata, and creation time are
  immutable once stored; review rows cannot be deleted from the browser.
- Report finalization is Head-only through `finalize_month_head()`.
- Production responses include CSP, HSTS, frame, MIME-sniffing, referrer,
  and permissions headers.

## Testing

`npm test` runs the unit tests for timezone-safe date math, storage path
parsing, link validation, submission validation, safe file MIME handling, and
CSV formula-injection protection. Add integration tests against a staging
Supabase project for RLS/RPC changes; never run write tests against production.

`.github/workflows/ci.yml` runs lint, tests, typecheck, and a production build
on pushes and pull requests with placeholder Supabase environment values.

## Design tokens

| Token | Value | Use |
|---|---|---|
| `base` | `#E6EBF2` | Page + surface background |
| `base-light` | `#FFFFFF` | Light-side shadow (raised/pressed) |
| `base-dark` | `#B7C1D1` | Dark-side shadow (raised/pressed) |
| `ink` | `#2B3542` | Primary text |
| `ink-muted` | `#71798A` | Labels, secondary text |
| `accent` | `#B8862E` | Icon mark, active states, button label |

Fonts: **Fraunces** for the "Daong" wordmark only, **Manrope** for all UI text.

## Project structure

```
app/                 App Router pages, layouts, and API routes
components/          Head, employee, and shared UI
lib/                 Auth, time, storage, report, and validation logic
supabase/            Schema and migration SQL
tests/               Node test-runner unit tests
```

## Operational notes

- Back up the database and Storage before applying security migrations.
- Before the core hardening SQL, check for legacy duplicate open sessions:
  `select employee_id, count(*) from public.sessions where time_out is null
  group by employee_id having count(*) > 1;`
  The migration stops with their IDs instead of deleting attendance data;
  close the extra sessions deliberately, then rerun it.
- Keep `project-files` private; do not reintroduce public bucket URLs.
- Migration order matters. This hardening file must run after the older
  schema/report/notification migrations. Rerunning an older migration can
  recreate permissive policies; rerun the hardening file afterwards.
- Monitor server logs for `[outputs]`, `[reports]`, `[employees]`, and
  `[equipment]` errors. Client responses intentionally omit database details.
- Browser QA should cover Head and Staff accounts at 320, 375, 768, 1024,
  1366, 1440, and 1920px.
