import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthWindow } from "@/lib/attendance";
import { Availability, Profile } from "@/lib/types";

/**
 * Head read-only view of everyone's availability.
 *
 * Role gating: only Heads (role 'head') may read it. Editing another
 * person's schedule is still owner-only — this route only ever reads.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "head") {
    return NextResponse.json(
      { error: "Head access required." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // "YYYY-MM"
  const userFilter = searchParams.get("user");
  const positionFilter = searchParams.get("position");
  const statusFilter = searchParams.get("status");
  const dateFilter = searchParams.get("date");

  // ---- People who submit availability: Staff and Heads --------------
  let peopleQuery = supabase
    .from("profiles")
    .select("id, full_name, position, role")
    .in("role", ["staff", "head"])
    .order("full_name");

  if (userFilter) peopleQuery = peopleQuery.eq("id", userFilter);
  if (positionFilter) peopleQuery = peopleQuery.eq("position", positionFilter);

  const { data: peopleData, error: peopleError } = await peopleQuery;

  if (peopleError) {
    console.error("[head/availability] people query failed:", peopleError.message);
    return NextResponse.json(
      { error: "Could not load employee schedules." },
      { status: 400 }
    );
  }

  const people = (peopleData ?? []) as Pick<
    Profile,
    "id" | "full_name" | "position"
  >[];

  if (people.length === 0) {
    return NextResponse.json({ data: [], people: [] });
  }

  // ---- Availability rows for the requested window ---------------------
  let rowsQuery = supabase
    .from("availability")
    .select("*")
    .in(
      "employee_id",
      people.map((p) => p.id)
    )
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const { start, endExclusive } = monthWindow(monthParam);
    rowsQuery = rowsQuery.gte("date", start).lt("date", endExclusive);
  }
  if (dateFilter) rowsQuery = rowsQuery.eq("date", dateFilter);
  if (statusFilter === "available" || statusFilter === "unavailable") {
    rowsQuery = rowsQuery.eq("status", statusFilter);
  }

  const { data: rowsData, error: rowsError } = await rowsQuery;

  if (rowsError) {
    return NextResponse.json(
      {
        error:
          "The availability table is missing. Run supabase/schedule_management.sql in your Supabase SQL editor.",
      },
      { status: 400 }
    );
  }

  const rows = (rowsData ?? []) as Availability[];
  const byId = new Map(people.map((p) => [p.id, p]));

  const data = rows.map((row) => ({
    ...row,
    profile: byId.get(row.employee_id) ?? null,
  }));

  return NextResponse.json({ data, people });
}
