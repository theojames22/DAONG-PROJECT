import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/settings/email
// Updates any signed-in user's own Gmail. Works for both Heads and
// employees — the update targets only auth.uid() = the caller.
// This MUST run server-side with the service-role key: writing to
// auth.users cannot be done from the browser with the anon key, and a
// client-side email change would trigger a confirmation-email flow
// instead of applying immediately.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;

  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 72 ||
    !user.email
  ) {
    return NextResponse.json(
      { error: "Enter your current password to change your email." },
      { status: 400 }
    );
  }

  // Email is an account-recovery identifier. Re-authenticate before changing
  // it so a stolen session cannot silently move the account to an attacker's
  // address and then use password reset. This client is intentionally
  // non-persistent and never writes cookies.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (verifyError) {
    console.warn("[settings/email] password verification failed");
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 }
    );
  }

  const cleanEmail = email.trim().toLowerCase();
  const admin = createAdminClient();

  // Update the auth record first — if it fails (e.g. email already in use),
  // nothing else runs.
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: cleanEmail,
    email_confirm: true,
  });

  if (authError) {
    console.error("[settings/email] auth update failed:", authError.message);
    return NextResponse.json(
      { error: "That email could not be used. Try another address." },
      { status: 400 }
    );
  }

  // Keep the cached copy on the profile in sync.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ email: cleanEmail })
    .eq("id", user.id);

  if (profileError) {
    console.error("[settings/email] profile sync failed:", profileError.message);
    return NextResponse.json(
      { error: "The email changed but the profile could not be updated. Contact a Head." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
