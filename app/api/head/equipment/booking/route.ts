import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKeyIn } from "@/lib/time";
import { getAppTimezone } from "@/lib/report/queries";
import { isMissingColumnError } from "@/lib/equipment";

/**
 * Booking endpoint — the backend half of the conflict rules.
 * The UI pre-checks before saving and re-checks again here;
 * the database's exclusion constraints remain the final guard
 * against simultaneous reservations.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EQUIPMENT_CONFLICT =
  "This equipment is already reserved for the selected time. Please choose another time.";
const PERSON_CONFLICT =
  "You already have a booking during this time. Please choose another schedule.";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "head") {
    return {
      error: NextResponse.json(
        { error: "Head access required." },
        { status: 403 }
      ),
    };
  }

  return {
    userId: user.id,
    timezone: await getAppTimezone(supabase),
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface ConflictCheck {
  equipmentId: string;
  userId: string;
  startedIso: string;
  endedIso: string;
  /** Row to ignore — editing must never conflict with itself. */
  excludeId?: string;
}

type ConflictOutcome =
  | { field: "equipment" | "user"; message: string }
  | { failed: true }
  | null;

/**
 * Backend conflict recheck against real rows — shared by create (POST)
 * and edit (PATCH). Returns the first conflict found, `{ failed: true }`
 * when the check itself couldn't run (so callers never write blind), or
 * null when the slot is free.
 */
async function findConflicts(
  admin: AdminClient,
  { equipmentId, userId, startedIso, endedIso, excludeId }: ConflictCheck
): Promise<ConflictOutcome> {
  const buildConflict = (
    column: "equipment_id" | "user_id",
    value: string,
    withCancelFilter: boolean
  ) => {
    let query = admin
      .from("equipment_usage")
      .select("id")
      .eq(column, value)
      .lt("started_at", endedIso)
      .gt("ended_at", startedIso);
    if (excludeId) query = query.neq("id", excludeId);
    return (withCancelFilter ? query.is("cancelled_at", null) : query).limit(1);
  };

  const runChecks = (withCancelFilter: boolean) =>
    Promise.all([
      buildConflict("equipment_id", equipmentId, withCancelFilter),
      buildConflict("user_id", userId, withCancelFilter),
    ]);

  let [equipmentConflict, personConflict] = await runChecks(true);
  if (
    isMissingColumnError(equipmentConflict.error) ||
    isMissingColumnError(personConflict.error)
  ) {
    // Schema drift: the soft-cancel column isn't deployed yet. Re-run
    // without the filter — if it's absent, nothing can be cancelled.
    [equipmentConflict, personConflict] = await runChecks(false);
  }

  // Never write blind: if the check itself failed, report it.
  if (equipmentConflict.error || personConflict.error) {
    return { failed: true };
  }
  if (equipmentConflict.data && equipmentConflict.data.length > 0) {
    return { field: "equipment", message: EQUIPMENT_CONFLICT };
  }
  if (personConflict.data && personConflict.data.length > 0) {
    return { field: "user", message: PERSON_CONFLICT };
  }
  return null;
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { user_id: userId, equipment_id: equipmentId, started_at, ended_at, remarks } = body;

  if (!UUID_RE.test(String(userId ?? "")) || !UUID_RE.test(String(equipmentId ?? ""))) {
    return NextResponse.json(
      { error: "Choose a staff member and equipment from the lists." },
      { status: 400 }
    );
  }

  const startedAt = new Date(started_at ?? "");
  const endedAt = new Date(ended_at ?? "");

  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return NextResponse.json(
      { error: "Choose a start time and an end time." },
      { status: 400 }
    );
  }

  if (endedAt.getTime() <= startedAt.getTime()) {
    return NextResponse.json(
      { error: "End time must be later than the start time." },
      { status: 400 }
    );
  }

  // The date can't be in the future (earlier today is fine — the
  // entry records usage that already happened).
  const todayKey = dateKeyIn(guard.timezone);
  if (dateKeyIn(guard.timezone, startedAt) > todayKey) {
    return NextResponse.json(
      { error: "Usage can't be in the future." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (target?.role !== "staff") {
    return NextResponse.json(
      { error: "Equipment usage can only be recorded for Staff." },
      { status: 400 }
    );
  }
  const startedIso = startedAt.toISOString();
  const endedIso = endedAt.toISOString();
  const durationMinutes = Math.round(
    (endedAt.getTime() - startedAt.getTime()) / 60000
  );

  // ---- Backend conflict recheck against real rows ----
  const existingConflict = await findConflicts(admin, {
    equipmentId,
    userId,
    startedIso,
    endedIso,
  });
  if (existingConflict) {
    if ("failed" in existingConflict) {
      return NextResponse.json(
        { error: "Couldn't verify booking conflicts. Please try again." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: existingConflict.message, ...existingConflict }, { status: 409 });
  }

  const { error: insertError } = await admin.from("equipment_usage").insert({
    user_id: userId,
    equipment_id: equipmentId,
    started_at: startedIso,
    ended_at: endedIso,
    duration_minutes: durationMinutes,
    remarks: typeof remarks === "string" && remarks.trim() ? remarks.trim() : null,
    logged_by: guard.userId,
  });

  if (insertError) {
    // 23P01 = the exclusion constraint rejected a simultaneous
    // double booking. Re-run the checks so the message names the
    // field that actually conflicts.
    if (insertError.code === "23P01") {
      const conflict = await findConflicts(admin, {
        equipmentId,
        userId,
        startedIso,
        endedIso,
      });
      if (conflict && "field" in conflict) {
        return NextResponse.json(
          { error: conflict.message, ...conflict },
          { status: 409 }
        );
      }
    }
    console.error("[equipment/booking] insert failed:", insertError.message);
    return NextResponse.json(
      { error: "Could not save the entry. Try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    id,
    user_id: userId,
    equipment_id: equipmentId,
    started_at,
    ended_at,
    remarks,
  } = body;

  if (!UUID_RE.test(String(id ?? ""))) {
    return NextResponse.json(
      { error: "That entry could not be identified." },
      { status: 400 }
    );
  }

  if (
    !UUID_RE.test(String(userId ?? "")) ||
    !UUID_RE.test(String(equipmentId ?? ""))
  ) {
    return NextResponse.json(
      { error: "Choose a staff member and equipment from the lists." },
      { status: 400 }
    );
  }

  const startedAt = new Date(started_at ?? "");
  const endedAt = new Date(ended_at ?? "");

  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return NextResponse.json(
      { error: "Choose a start time and an end time." },
      { status: 400 }
    );
  }

  if (endedAt.getTime() <= startedAt.getTime()) {
    return NextResponse.json(
      { error: "End time must be later than the start time." },
      { status: 400 }
    );
  }

  const todayKey = dateKeyIn(guard.timezone);
  if (dateKeyIn(guard.timezone, startedAt) > todayKey) {
    return NextResponse.json(
      { error: "Usage can't be in the future." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (target?.role !== "staff") {
    return NextResponse.json(
      { error: "Equipment usage can only be recorded for Staff." },
      { status: 400 }
    );
  }

  const startedIso = startedAt.toISOString();
  const endedIso = endedAt.toISOString();
  const durationMinutes = Math.round(
    (endedAt.getTime() - startedAt.getTime()) / 60000
  );

  // Re-check both conflict rules against real rows, ignoring the row
  // being edited so a record never conflicts with itself.
  const conflict = await findConflicts(admin, {
    equipmentId,
    userId,
    startedIso,
    endedIso,
    excludeId: id,
  });
  if (conflict) {
    if ("failed" in conflict) {
      return NextResponse.json(
        { error: "Couldn't verify booking conflicts. Please try again." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: conflict.message, ...conflict },
      { status: 409 }
    );
  }

  // RLS (the head UPDATE policy) is the authorization gate. Only the
  // correctable fields are written — logged_by and created_at stay as
  // the original audit trail and are never touched. duration_minutes is
  // recomputed here from the new start/end, not trusted from the client.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_usage")
    .update({
      user_id: userId,
      equipment_id: equipmentId,
      started_at: startedIso,
      ended_at: endedIso,
      duration_minutes: durationMinutes,
      remarks:
        typeof remarks === "string" && remarks.trim() ? remarks.trim() : null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    // 23P01 = the exclusion constraint fired between our check and the
    // write. Re-run the checks so the message names the real conflict.
    if (error.code === "23P01") {
      const late = await findConflicts(createAdminClient(), {
        equipmentId,
        userId,
        startedIso,
        endedIso,
        excludeId: id,
      });
      if (late && "field" in late) {
        return NextResponse.json(
          { error: late.message, ...late },
          { status: 409 }
        );
      }
    }
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "That user or equipment no longer exists." },
        { status: 400 }
      );
    }
    console.error("[equipment/booking] update failed:", error.message);
    return NextResponse.json(
      { error: "Could not save the changes. Try again." },
      { status: 400 }
    );
  }

  if (!data) {
    // RLS matched no row: the entry is gone, or this account may not
    // edit it. Either way nothing was written.
    return NextResponse.json(
      {
        error:
          "That entry couldn't be updated. It may have been removed, or your account may not have permission.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const id = body?.id;

  if (!UUID_RE.test(String(id ?? ""))) {
    return NextResponse.json(
      { error: "That entry could not be identified." },
      { status: 400 }
    );
  }

  // RLS (the head DELETE policy) is the authorization gate: without it
  // this delete removes nothing, and we report the entry as gone rather
  // than pretending it succeeded.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_usage")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[equipment/booking] delete failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't delete the entry. Try again." },
      { status: 400 }
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      {
        error:
          "That entry couldn't be deleted. It may have already been removed, or your account may not have permission.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
