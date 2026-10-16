-- Run this in your Supabase project's SQL Editor (Project → SQL Editor → New query).

-- 1. Profiles table — one row per employee, linked 1:1 to Supabase's auth.users.
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  position text,
  role text not null default 'staff' check (role in ('head', 'staff')),
  required_weekly_hours numeric not null default 40,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Helper function to check Head (administrator) status without triggering
--    RLS recursion (a policy that queries profiles from within a profiles
--    policy would loop otherwise — security definer functions bypass RLS
--    safely for this check). Every "admin-class" policy calls is_admin();
--    after the Admin→Head merge it means role = 'head'.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'head'
  );
$$;

-- Staff-only check, mirroring is_admin(). Used to keep attendance records
-- to Staff: Heads do not clock in/out.
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'staff'
  );
$$;

-- 3. Row-level security policies.
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Heads can view every profile"
  on public.profiles for select
  using (public.is_admin());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Heads can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- 4. Auto-create a profile row whenever someone signs up.
--    Pass full_name / role in signUp's options.data (see login page notes) —
--    role defaults to 'staff' if not provided, so Heads must be promoted
--    manually (see the UPDATE statement at the bottom of this file).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'role', 'staff')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. To make your first Head (administrator) account, after signing up once:
--    update public.profiles set role = 'head', position = 'head' where id = '<paste the user id from auth.users>';

-- =====================================================================
-- SESSIONS — one row per time-in/time-out pair. A single employee can
-- have several rows on the same date (6-8am, 1-5pm, etc).
-- =====================================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  time_in timestamptz not null,
  time_out timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Users can view their own sessions"
  on public.sessions for select
  using (auth.uid() = employee_id);

create policy "Heads can view all sessions"
  on public.sessions for select
  using (public.is_admin());

-- Only Staff may open a session; Heads do not clock in/out.
create policy "Users can insert their own sessions"
  on public.sessions for insert
  with check (auth.uid() = employee_id and public.is_staff());

create policy "Users can update their own open session"
  on public.sessions for update
  using (auth.uid() = employee_id);

create policy "Heads can update any session"
  on public.sessions for update
  using (public.is_admin());

-- =====================================================================
-- OUTPUTS — a deliverable (file/link/image) tied to a specific date.
-- Presence of at least one output on a date is what makes that date's
-- attendance "Present" rather than "Unverified", per the earlier rule.
-- =====================================================================
create table public.outputs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  date date not null default current_date,
  title text,
  attachment_type text not null check (attachment_type in ('file', 'link', 'image')),
  attachment_url text not null,
  status text not null default 'pending' check (status in ('pending', 'checking', 'done')),
  reviewed_by uuid references public.profiles(id),
  reviewer_notes text,
  created_at timestamptz not null default now()
);

alter table public.outputs enable row level security;

create policy "Users can view their own outputs"
  on public.outputs for select
  using (auth.uid() = employee_id);

create policy "Heads can view all outputs"
  on public.outputs for select
  using (public.is_admin());

create policy "Users can insert their own outputs"
  on public.outputs for insert
  with check (auth.uid() = employee_id);

create policy "Heads can update any output"
  on public.outputs for update
  using (public.is_admin());

-- =====================================================================
-- DAILY HOURS VIEW — sums each employee's sessions per calendar date.
-- Open sessions (time_out is null) count toward "now" so a running clock
-- shows live hours; has_open_session flags it for the admin's attention.
-- =====================================================================
create view public.daily_hours
with (security_invoker = true) as
select
  employee_id,
  (time_in at time zone 'utc')::date as date,
  sum(extract(epoch from (coalesce(time_out, now()) - time_in)) / 3600.0) as hours,
  count(*) as session_count,
  bool_or(time_out is null) as has_open_session
from public.sessions
group by employee_id, (time_in at time zone 'utc')::date;
