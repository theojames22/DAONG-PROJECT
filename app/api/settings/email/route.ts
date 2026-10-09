import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/settings/email
// Updates any signed-in user's own Gmail. Works for both admins and
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

  const { email } = await request.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
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
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Keep the cached copy on the profile in sync.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ email: cleanEmail })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
