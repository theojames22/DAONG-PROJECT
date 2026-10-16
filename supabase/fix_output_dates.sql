-- =====================================================================
-- FIX OUTPUT DATES — correct rows stored with the UTC calendar date.
-- Run this in Supabase → SQL Editor → New query → paste → Run.
--
-- WHY THIS EXISTS
--   The submit form used to derive the date with
--   `new Date().toISOString().split("T")[0]` — a UTC date. For anyone east
--   of UTC (GMT+8), a submission made between local midnight and 08:00
--   was filed under the PREVIOUS day, so the admin Attendance page
--   (which filters by the local date) never showed it, even though the
--   admin dashboard — which counts without a date filter — did.
--   The app now writes the local date; this repairs what was stored.
--
-- ⚠️ TIMEZONE — 'Asia/Manila' must match your team's timezone (the
--    screenshots showed GMT+8 / Philippines). If your staff sit
--    elsewhere, replace every 'Asia/Manila' below with the correct zone
--    name (e.g. 'Asia/Tokyo', 'UTC') before running.
--
-- SAFE TO RE-RUN: after the UPDATE no row matches the WHERE clause, so a
-- second run changes nothing.
-- =====================================================================

-- PREVIEW — run this first (changes nothing). It lists every row that
-- would be corrected, with its stored and computed date:
--
--   select id,
--          title,
--          date as stored_date,
--          (created_at at time zone 'Asia/Manila')::date as local_date
--     from public.outputs
--    where date <> (created_at at time zone 'Asia/Manila')::date
--    order by created_at desc;

-- CORRECTION — one guarded UPDATE, touching only mismatched rows.
update public.outputs
   set date = (created_at at time zone 'Asia/Manila')::date
 where date <> (created_at at time zone 'Asia/Manila')::date;

-- VERIFY — should return zero rows:
--   select id, date, (created_at at time zone 'Asia/Manila')::date
--     from public.outputs
--    where date <> (created_at at time zone 'Asia/Manila')::date;
