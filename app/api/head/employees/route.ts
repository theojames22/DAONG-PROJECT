import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
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

  if (requester?.role !== "head") {
    return NextResponse.json({ error: "Head access required." }, { status: 403 });
  }

  const {
    email,
    password,
    full_name,
    position,
    role,
    required_weekly_hours,
  } = await request.json();

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: "Email, temporary password, and name are required." },
      { status: 400 }
    );
  }

  // Position determines the dashboard. Only the two canonical positions are
  // accepted (legacy 'admin' is treated as 'head') — anything else is
  // rejected rather than silently mapped.
  const normalizedPosition =
    typeof position === "string" ? position.trim().toLowerCase() : "";

  let assignedRole: "head" | "staff";
  if (normalizedPosition === "head" || normalizedPosition === "admin") {
    // Head is the administrator: full management access, and no clock
    // in/out, QR code or required weekly hours.
    assignedRole = "head";
  } else if (normalizedPosition === "staff") {
    assignedRole = "staff";
  } else if (role === "head" || role === "staff") {
    // Legacy callers that still send an explicit role.
    assignedRole = role;
  } else {
    return NextResponse.json(
      { error: "Position must be Head or Staff." },
      { status: 400 }
    );
  }

  const isNewHead = assignedRole === "head";
  const finalPosition =
    normalizedPosition === "head" ||
    normalizedPosition === "admin" ||
    normalizedPosition === "staff"
      ? normalizedPosition === "admin"
        ? "head"
        : normalizedPosition
      : assignedRole;

  // The weekly requirement is expressed in hours. A malformed value falls
  // back to the column default rather than writing NaN into the profile.
  const hours = Number(required_weekly_hours);

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: assignedRole },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || "Could not create the account." },
      { status: 400 }
    );
  }

  // The handle_new_user trigger already inserted a profiles row with
  // full_name + role='staff' — fill in the remaining fields here.
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      role: assignedRole,
      position: finalPosition,
      required_weekly_hours:
        Number.isFinite(hours) && hours >= 0 ? hours : (isNewHead ? 0 : 40),
    })
    .eq("id", created.user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (requester?.role !== "head") {
    return NextResponse.json({ error: "Head access required." }, { status: 403 });
  }

  const { id, full_name, position, role, required_weekly_hours } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "Employee ID is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const updateData: Record<string, any> = {};

  if (full_name !== undefined) updateData.full_name = full_name;

  if (position !== undefined) {
    const normalizedPosition =
      typeof position === "string" ? position.trim().toLowerCase() : "";

    // Accept only the two canonical positions (legacy 'admin' → 'head').
    const positionToRole: Record<string, "head" | "staff"> = {
      head: "head",
      admin: "head",
      staff: "staff",
    };

    if (positionToRole[normalizedPosition]) {
      const resolvedPosition =
        normalizedPosition === "admin" ? "head" : normalizedPosition;
      updateData.position = resolvedPosition;
      // Keep the auth role in lockstep with the position so the
      // dashboards and permissions always agree.
      updateData.role = positionToRole[normalizedPosition];
    } else if (position === null) {
      updateData.position = null;
    } else if (role !== undefined) {
      // Legacy callers that send role without a canonical position.
      updateData.position = position || null;
    }
  }

  if (role !== undefined && updateData.role === undefined) {
    updateData.role = role;
  }

  if (required_weekly_hours !== undefined) {
    const hours = Number(required_weekly_hours);
    updateData.required_weekly_hours = Number.isFinite(hours) && hours >= 0 ? hours : 0;
  }

  const { error } = await admin.from("profiles").update(updateData).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
