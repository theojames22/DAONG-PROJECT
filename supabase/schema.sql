-- Run this in your Supabase project's SQL Editor (Project → SQL Editor → New query).

-- 1. Profiles table — one row per employee, linked 1:1 to Supabase's auth.users.
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  position text,
  role text not null default 'employee' check (role in ('employee', 'admin')),
  required_weekly_hours numeric not null default 40,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. Helper function to check admin status without triggering RLS recursion
--    (a policy that queries profiles from within a profiles policy would loop
--    otherwise — security definer functions bypass RLS safely for this check).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 3. Row-level security policies.
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view every profile"
  on public.profiles for select
  using (public.is_admin());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update
  using (public.is_admin());

-- 4. Auto-create a profile row whenever someone signs up.
--    Pass full_name / role in signUp's options.data (see login page notes) —
--    role defaults to 'employee' if not provided, so admins must be promoted
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
    coalesce(new.raw_user_meta_data ->> 'role', 'employee')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. To make your first admin account, after signing up once through the app:
--    update public.profiles set role = 'admin' where id = '<paste the user id from auth.users>';
