import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cancel a booking — the only write allowed after saving.
 * Soft cancel: the row keeps its history but stops blocking
 * availability (the conflict constraints ignore cancelled rows).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "head") {
    return NextResponse.json(
      { error: "Head access required." },
      { status: 403 }
    );
  }

  const { id } = await request.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json(
      { error: "Booking ID is required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Only active rows can be cancelled — cancelling twice is a
  // no-op that reports back instead of overwriting history.
  const { data, error } = await admin
    .from("equipment_usage")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("cancelled_at", null)
    .select("id")
    .single();

  if (error) {
    // PGRST116 = `.single()` matched no active row, i.e. it was already
    // cancelled. Anything else is a genuine failure and is surfaced.
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "That booking was already cancelled." },
        { status: 400 }
      );
    }
    console.error("[equipment/cancel] failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't cancel the booking. Try again." },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "That booking was already cancelled." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
