import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Re-check the caller's role server-side — never trust the client here,
  // even though the UI only shows this form to admins.
  const { data: requester } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (requester?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { email, password, full_name, position, required_weekly_hours } =
    await request.json();

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: "Email, temporary password, and name are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: "employee" },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || "Could not create the account." },
      { status: 400 }
    );
  }

  // The handle_new_user trigger already inserted a profiles row with
  // full_name + role='employee' — fill in the remaining fields here.
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      position: position || null,
      required_weekly_hours: required_weekly_hours || 40,
    })
    .eq("id", created.user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id });
}
