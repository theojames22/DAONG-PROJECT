-- =====================================================================
-- ADVANCED, USER-SPECIFIC APPEARANCE PREFERENCES
-- Run in Supabase → SQL Editor after a backup/PITR snapshot.
--
-- Additive and non-destructive:
--   • reuses the existing one-row-per-user public.profiles table,
--   • stores both Light and Dark palettes independently in one JSONB value,
--   • keeps profiles.theme_preference for backwards compatibility / mode,
--   • relies on the existing RLS rule "Users can update their own profile"
--     (auth.uid() = id) so one account can never write another's row.
--
-- The app also reads/writes this through an authenticated server route that
-- derives the user id from the session. A client-supplied user id is never
-- accepted by that route.
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists appearance_preferences jsonb not null default '{}'::jsonb;

-- Guard against malformed/oversized rows. The application still sanitises on
-- read, so old or hand-edited data can never break the UI.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_appearance_preferences_object'
  ) then
    alter table public.profiles
      add constraint profiles_appearance_preferences_object
      check (
        jsonb_typeof(appearance_preferences) = 'object'
        and pg_column_size(appearance_preferences) < 30000
      );
  end if;
end $$;

-- The old constraint only allowed light/dark. System Mode is now a saved
-- preference; the concrete light/dark palette is stored independently.
alter table public.profiles
  drop constraint if exists profiles_theme_preference_check;

alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));

comment on column public.profiles.appearance_preferences is
  'Per-user advanced appearance JSON: { version, mode, light:{preset,colors}, dark:{preset,colors}, options }. Owned exclusively by the authenticated user.';

commit;
