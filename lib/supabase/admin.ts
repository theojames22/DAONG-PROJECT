import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// IMPORTANT: uses the service role key, which bypasses row-level security
// entirely. Never import this file from a client component, and never send
// this key to the browser — it must stay out of any NEXT_PUBLIC_ var.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
