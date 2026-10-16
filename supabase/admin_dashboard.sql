-- =====================================================================
-- ADMIN DASHBOARD MIGRATION — projects + notifications + profile extras
-- Run this in your Supabase project's SQL Editor
-- (Project → SQL Editor → New query → paste → Run).
--
-- This file is ADDITIVE. It does NOT touch the existing `outputs`
-- table, its data, or its review flow — `projects` is a new, separate
-- table with its own approval flow.
-- Re-running this file is safe (everything uses if not exists / guards).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES — new columns for the admin dashboard
--    email              → cached copy of auth.users.email
--    profile_picture_url→ public URL of the uploaded avatar
--    theme_preference   → 'light' | 'dark', drives the UI theme
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text,
  add column if not exists profile_picture_url text,
  add column if not exists theme_preference text not null default 'light'
    check (theme_preference in ('light', 'dark'));

-- Backfill email for users that already exist
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

-- Update the signup trigger so new users get their email copied too.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'role', 'staff'),
    new.email
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. PROJECTS — staff uploads awaiting admin approval.
--    Deliberately separate from the legacy `outputs` table.
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text,
  file_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid not null
    constraint projects_submitted_by_fkey
    references public.profiles(id) on delete cascade,
  reviewed_by uuid
    constraint projects_reviewed_by_fkey
    references public.profiles(id) on delete set null,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_submitted_by_idx on public.projects (submitted_by);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists projects_created_at_idx on public.projects (created_at desc);

alter table public.projects enable row level security;

-- Employees can see their own projects; Heads (administrators) can see all.
drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = submitted_by);

drop policy if exists "Heads can view all projects" on public.projects;
create policy "Heads can view all projects"
  on public.projects for select
  using (public.is_admin());

-- Employees can only insert their own, and only as 'pending'.
-- (Without this a user could self-approve by passing status='approved'.)
drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects"
  on public.projects for insert
  with check (auth.uid() = submitted_by and status = 'pending');

-- Only Heads (administrators) can approve / reject / annotate.
drop policy if exists "Heads can update any project" on public.projects;
create policy "Heads can update any project"
  on public.projects for update
  using (public.is_admin());

drop policy if exists "Heads can delete any project" on public.projects;
create policy "Heads can delete any project"
  on public.projects for delete
  using (public.is_admin());

-- Keep updated_at fresh on every status change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_projects_updated on public.projects;
create trigger on_projects_updated
  before update on public.projects
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. NOTIFICATIONS — alert loop + cross-messaging between staff/head.
--    project_id is optional: null = direct message, set = thread about
--    a specific project (enables deep-linking to its approval page).
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null
    constraint notifications_sender_id_fkey
    references public.profiles(id) on delete cascade,
  receiver_id uuid not null
    constraint notifications_receiver_id_fkey
    references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) > 0),
  project_id uuid
    constraint notifications_project_id_fkey
    references public.projects(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_receiver_idx
  on public.notifications (receiver_id, is_read);
create index if not exists notifications_project_idx
  on public.notifications (project_id);
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- A user sees a thread if they are either side of it.
drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = receiver_id or auth.uid() = sender_id);

-- You may only send messages as yourself.
drop policy if exists "Users can send notifications as themselves" on public.notifications;
create policy "Users can send notifications as themselves"
  on public.notifications for insert
  with check (auth.uid() = sender_id);

-- Only the receiver can mark a message read.
drop policy if exists "Receivers can update their notifications" on public.notifications;
create policy "Receivers can update their notifications"
  on public.notifications for update
  using (auth.uid() = receiver_id);

-- Only the receiver can dismiss a message.
drop policy if exists "Receivers can delete their notifications" on public.notifications;
create policy "Receivers can delete their notifications"
  on public.notifications for delete
  using (auth.uid() = receiver_id);

-- ---------------------------------------------------------------------
-- 4. AUTO-ALERT — every time a project is submitted, notify all Heads.
--    Runs as security definer so it can read the Heads list + insert
--    regardless of the submitter's own RLS visibility.
-- ---------------------------------------------------------------------
create or replace function public.notify_admins_on_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submitter_name text;
begin
  select coalesce(full_name, 'An employee')
    into submitter_name
    from public.profiles
   where id = new.submitted_by;

  insert into public.notifications (sender_id, receiver_id, message, project_id)
  select new.submitted_by,
         a.id,
         submitter_name || ' submitted a project for approval: ' || new.title,
         new.id
    from public.profiles a
   where a.role = 'head'
     and a.id <> new.submitted_by;  -- don't notify a Head of their own upload

  return new;
end;
$$;

drop trigger if exists on_project_submitted on public.projects;
create trigger on_project_submitted
  after insert on public.projects
  for each row execute procedure public.notify_admins_on_project();

-- ---------------------------------------------------------------------
-- 5. REALTIME — feeds update live without page refresh.
--    The exception guard keeps this file re-runnable.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. STORAGE — avatars + project files.
--    Both buckets are public-read; uploads are scoped to the user's
--    own folder (auth.uid()) so nobody can overwrite someone else's files.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do nothing;

-- Avatars: anyone can view, owners manage their own folder.
drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Project files: anyone can view, owners manage their own folder.
drop policy if exists "Public read project files" on storage.objects;
create policy "Public read project files"
  on storage.objects for select
  using (bucket_id = 'project-files');

drop policy if exists "Users upload own project files" on storage.objects;
create policy "Users upload own project files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own project files" on storage.objects;
create policy "Users update own project files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- HOW THE PIECES CONNECT
-- ---------------------------------------------------------------------
-- Employee submits a project (status 'pending')
--   → on_project_submitted trigger fires
--   → one notification row per Head, project_id set for deep-linking
--   → Head's bell lights up in realtime
--   → clicking it opens /head/projects/{id}
--   → Head approves/rejects; replying inserts a notification back to
--     the employee with the same project_id, keeping the thread together
-- =====================================================================
