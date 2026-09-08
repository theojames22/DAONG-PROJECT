import { createBrowserClient } from "@supabase/ssr";

// Used inside client components (e.g. the login form) to call
// supabase.auth.signInWithPassword, read the session, etc.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables. Please check your .env.local file.");
  }

  return createBrowserClient(url, key);
}
