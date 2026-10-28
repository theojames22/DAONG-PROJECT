import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// IMPORTANT: uses the service role key, which bypasses row-level security
// entirely. Never import this file from a client component, and never send
// this key to the browser — it must stay out of any NEXT_PUBLIC_ var.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createSupabaseClient(
    url,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
