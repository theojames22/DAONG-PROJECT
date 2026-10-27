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
    // Role is assigned server-side below through the service-role client.
    // Never put an authorization value in user metadata: the signup trigger
    // is intentionally not allowed to trust it.
    user_metadata: { full_name },
  });

  if (createError || !created.user) {
    console.error("[employees] create user failed:", createError?.message);
    return NextResponse.json(
      { error: "Could not create the account. Check the email and try again." },
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
      required_weekly_hours: isNewHead
        ? 0
        : Number.isFinite(hours) && hours >= 0
          ? hours
          : 40,
    })
    .eq("id", created.user.id);

  if (updateError) {
    console.error("[employees] profile setup failed:", updateError.message);
    return NextResponse.json(
      { error: "The account was created but its profile could not be finalized." },
      { status: 500 }
    );
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

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const updateData: Record<string, string | number | null> = {};

  if (full_name !== undefined) {
    if (typeof full_name !== "string") {
      return NextResponse.json({ error: "Name must be text." }, { status: 400 });
    }
    updateData.full_name = full_name.trim() || null;
  }

  let nextRole: "head" | "staff" | undefined;

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
      nextRole = positionToRole[normalizedPosition];
      updateData.role = nextRole;
    } else if (position === null) {
      updateData.position = null;
    } else if (role !== undefined && (role === "head" || role === "staff")) {
      // Legacy callers that send role without a canonical position.
      updateData.position = position || null;
    } else {
      return NextResponse.json(
        { error: "Position must be Head or Staff." },
        { status: 400 }
      );
    }
  }

  if (role !== undefined && updateData.role === undefined) {
    if (role !== "head" && role !== "staff") {
      return NextResponse.json({ error: "Role must be Head or Staff." }, { status: 400 });
    }
    updateData.role = role;
    nextRole = role;
  }

  // Heads are administrators: never carry a weekly requirement.
  if (nextRole === "head") {
    updateData.required_weekly_hours = 0;
  } else if (nextRole === "staff" && required_weekly_hours === undefined) {
    updateData.required_weekly_hours = 40;
  } else if (required_weekly_hours !== undefined) {
    const hours = Number(required_weekly_hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
      return NextResponse.json(
        { error: "Required weekly hours must be between 0 and 168." },
        { status: 400 }
      );
    }
    updateData.required_weekly_hours = hours;
  }

  const { error } = await admin.from("profiles").update(updateData).eq("id", id);

  if (error) {
    console.error("[employees] profile update failed:", error.message);
    return NextResponse.json(
      { error: "Could not update the employee profile." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
