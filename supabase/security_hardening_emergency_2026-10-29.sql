-- =====================================================================
-- EMERGENCY AUTH / PROFILE GUARD — 2026-10-29
--
-- Use this ONLY if the full hardening rollout cannot be completed now and
-- the live project must keep serving the previous application version.
--
-- It closes the two critical browser-escalation paths:
--   1. public /auth/v1/signup creating a profile with a caller-chosen role
--   2. a signed-in Staff member PATCHing their own profiles.role to 'head'
--
-- It is safe for the current app's normal name/avatar/theme updates. It also
-- makes Head hours 0 and protects the final Head from demotion.
--
-- It does NOT fix direct attendance/output writes, anonymous report RPC
-- reachability, or the public project-files bucket. Run the full
-- security_hardening_2026-10-28.sql and storage migration afterwards.
-- =====================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    raise exception
      'Public sign-up is disabled. Ask a Head to create your account.'
      using errcode = '42501';
  end if;

  insert into public.profiles (
    id,
    full_name,
    role,
    email,
    position,
    required_weekly_hours
  )
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    'staff',
    new.email,
    null,
    40
  );
  return new;
end;
$$;

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is null
     or auth.role() = 'service_role'
     or public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.position is distinct from old.position
     or new.required_weekly_hours is distinct from old.required_weekly_hours
     or new.email is distinct from old.email
     or new.qr_token is distinct from old.qr_token
     or new.created_at is distinct from old.created_at then
    raise exception
      'This profile field is managed by a Head and cannot be changed here'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_guard_privileges on public.profiles;
create trigger on_profile_guard_privileges
  before update on public.profiles
  for each row execute procedure public.guard_profile_privileges();

update public.profiles
   set required_weekly_hours = 0
 where role = 'head'
   and required_weekly_hours is distinct from 0;

create or replace function public.enforce_profile_invariants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'head' then
    new.required_weekly_hours := 0;
  elsif new.required_weekly_hours < 0 or new.required_weekly_hours > 168 then
    raise exception 'Required weekly hours must be between 0 and 168'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.role = 'head'
     and new.role is distinct from 'head' then
    perform pg_advisory_xact_lock(hashtext('public.profiles.last_head')::bigint);

    if not exists (
      select 1
        from public.profiles
       where role = 'head'
         and id is distinct from old.id
    ) then
      raise exception 'At least one Head account must remain'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_invariants on public.profiles;
create trigger on_profile_invariants
  before insert or update on public.profiles
  for each row execute procedure public.enforce_profile_invariants();

commit;
