import { createBrowserClient } from "@supabase/ssr";

// Used inside client components (e.g. the login form) to call
// supabase.auth.signInWithPassword, read the session, etc.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
