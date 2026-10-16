-- =====================================================================
-- AVAILABILITY / SCHEDULE — Staff availability periods
-- Run this in your Supabase project's SQL Editor (Project → SQL Editor → New query).
-- =====================================================================

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.availability enable row level security;

-- Row Level Security: staff can only manage their own records; Heads can view all.
drop policy if exists "Users can view their own availability" on public.availability;
create policy "Users can view their own availability"
  on public.availability for select
  using (auth.uid() = employee_id);

drop policy if exists "Heads can view all availability" on public.availability;
create policy "Heads can view all availability"
  on public.availability for select
  using (public.is_admin());

drop policy if exists "Users can insert their own availability" on public.availability;
create policy "Users can insert their own availability"
  on public.availability for insert
  with check (auth.uid() = employee_id);

drop policy if exists "Users can update their own availability" on public.availability;
create policy "Users can update their own availability"
  on public.availability for update
  using (auth.uid() = employee_id);

drop policy if exists "Users can delete their own availability" on public.availability;
create policy "Users can delete their own availability"
  on public.availability for delete
  using (auth.uid() = employee_id);

create index if not exists idx_availability_employee_date
  on public.availability(employee_id, date);
