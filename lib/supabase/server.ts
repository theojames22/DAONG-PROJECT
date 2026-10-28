import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

// Used inside server components / server actions (e.g. app/employee/page.tsx)
// to read the logged-in user and query the database with their session.
// Note: createClient is async because cookies() must be awaited in Next.js 14+.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie writes are not allowed here.
            // This is safe to ignore; the middleware handles token refresh writes.
          }
        },
      },
    }
  );
}
