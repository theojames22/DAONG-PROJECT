-- =====================================================================
-- ATTENDANCE QR MIGRATION — staff QR tokens + admin resolve/stamp RPCs.
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- Re-runnable: every statement is guarded.
--
-- Extends the existing `sessions` attendance flow with:
--   1. a unique qr_token per employee (printed as their QR code)
--   2. admin-only RPCs: resolve a scanned token → confirm → stamp
--   3. realtime on sessions/outputs so the admin list updates live
-- The Head "Scan Staff QR" tool on /head/workforce drives #2 end-to-end.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Every employee gets a stable unique token. Existing rows are
--    backfilled automatically by the DEFAULT.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists qr_token uuid not null default gen_random_uuid();

-- One token can map to exactly one profile.
create unique index if not exists profiles_qr_token_key
  on public.profiles (qr_token);

-- ---------------------------------------------------------------------
-- 2. RESOLVE — admin scans a code, we look up who it belongs to
--    BEFORE stamping anything (prevents accidental double-scans).
--    Returns the employee's identity or an empty result.
--    NOTE: "position" is quoted because POSITION is a reserved keyword in
--    RETURNS TABLE clauses; the returned column is still named position.
--    The uuid cast is exception-guarded so scanning a random QR code
--    (e.g. a wifi code) returns "no match" instead of erroring.
-- ---------------------------------------------------------------------
create or replace function public.resolve_qr_token(p_token text)
returns table (id uuid, full_name text, "position" text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  begin
    v_token := p_token::uuid;
  exception when others then
    return; -- not a valid uuid → simply no match
  end;

  return query
    select p.id, p.full_name, p.position
      from public.profiles p
     where p.qr_token = v_token
       and public.is_admin()          -- only Heads may resolve tokens
     limit 1;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. TOGGLE — the actual stamp. One atomic, admin-only call:
--      p_open_session_id is null → TIME IN  (new open session)
--      p_open_session_id set     → TIME OUT (close that session)
--    The caller passes the open session id it already loaded, so there
--    is never a race between two devices or a double scan.
-- ---------------------------------------------------------------------
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
begin
  if not public.is_admin() then
    raise exception 'Head access required';
  end if;

  if p_open_session_id is null then
    -- TIME IN: refuse if the employee somehow still has an open session
    -- (belt-and-braces — the UI passes the id when one exists).
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
    -- TIME OUT: only close a session that is genuinely still open.
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

-- ---------------------------------------------------------------------
-- 4. REALTIME — the admin attendance list re-renders the moment a scan
--    or an employee upload lands. Re-runnable via the exception guard.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.outputs;
exception
  when duplicate_object then null;
end;
$$;

-- =====================================================================
-- FLOW
--   1. Employee opens "My QR" on their dashboard → renders their token
--   2. Admin clicks "Scan Staff QR" on /head/workforce → camera opens
--   3. Scan → resolve_qr_token → confirm card → tap
--   4. admin_toggle_attendance stamps time-in, or time-out if open
--   5. Both dashboards update in real time (sessions/outputs are live)
-- =====================================================================
