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

  const body = await request.json().catch(() => null);
  const {
    email,
    password,
    full_name,
    position,
    role,
    required_weekly_hours,
  } = body ?? {};

  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanName = typeof full_name === "string" ? full_name.trim() : "";

  if (
    !cleanEmail ||
    cleanEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !cleanName ||
    cleanName.length > 120
  ) {
    return NextResponse.json(
      {
        error:
          "A valid email, a name (maximum 120 characters), and a temporary password of 8–72 characters with at least one letter and one number are required.",
      },
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

  // The weekly requirement is expressed in hours. A missing value uses the
  // product default; a malformed or out-of-range value is rejected instead of
  // being written to the profile.
  let hours = 40;
  if (!isNewHead && required_weekly_hours !== undefined) {
    hours = Number(required_weekly_hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
      return NextResponse.json(
        { error: "Required weekly hours must be between 0 and 168." },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    // Role is assigned server-side below through the service-role client.
    // Never put an authorization value in user metadata: the signup trigger
    // is intentionally not allowed to trust it.
    user_metadata: { full_name: cleanName },
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
      required_weekly_hours: isNewHead ? 0 : hours,
    })
    .eq("id", created.user.id);

  if (updateError) {
    console.error("[employees] profile setup failed:", updateError.message);
    // Do not leave a half-created auth account behind: the Head can retry
    // with the same email once the cause is fixed.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(
      created.user.id
    );
    if (cleanupError) {
      console.error(
        "[employees] orphan account cleanup failed:",
        cleanupError.message
      );
    }
    return NextResponse.json(
      { error: "The account could not be finalized. Try again." },
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

  const body = await request.json().catch(() => null);
  const { id, full_name, position, role, required_weekly_hours } = body ?? {};

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const updateData: Record<string, string | number | null> = {};

  if (full_name !== undefined) {
    if (typeof full_name !== "string" || full_name.trim().length > 120) {
      return NextResponse.json(
        { error: "Name must be text with a maximum of 120 characters." },
        { status: 400 }
      );
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

  // Heads are administrators: never carry a weekly requirement, including
  // when a legacy client sends only required_weekly_hours for an existing
  // Head and omits role/position.
  if (nextRole === "head" || (nextRole === undefined && target.role === "head")) {
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

  // Never allow the acting Head to remove their own administrator access, and
  // never allow the final Head account to be demoted. Both would lock the
  // organization out of every Head-only route.
  if (nextRole === "staff" && target.role === "head") {
    if (id === user.id) {
      return NextResponse.json(
        { error: "You cannot change your own role to Staff." },
        { status: 400 }
      );
    }

    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "head");

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "At least one Head account must remain." },
        { status: 400 }
      );
    }
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
