import { NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/report/session";
import { ReportError, getAppTimezone } from "@/lib/report/queries";
import { currentMonthKey, dateKeyIn } from "@/lib/report/calc";

/**
 * POST /api/reports/finalize  { month: "YYYY-MM" }
 *
 * Freezes a CLOSED month into snapshots for every eligible person.
 * Idempotent (the database upserts with version + 1), Head only,
 * and it refuses the current or a future month — those stay
 * provisional no matter how often this is called.
 */
export async function POST(request: Request) {
  const guard = await requireReportAccess();
  if (!guard.ok) return guard.response;

  const { supabase } = guard.session;

  let month: string;
  try {
    const body = await request.json();
    month = String(body?.month ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "A month in YYYY-MM form is required." },
      { status: 400 }
    );
  }

  try {
    const timezone = await getAppTimezone(supabase);
    const todayKey = dateKeyIn(timezone);
    const currentMonth = currentMonthKey(todayKey);

    if (month >= currentMonth) {
      throw new ReportError(
        "Only completed months can be finalized. The current month stays provisional.",
        400
      );
    }

    const { data: rowsWritten, error } = await supabase.rpc("finalize_month_head", {
      p_month: `${month}-01`,
    });

    if (error) {
      if (error.code === "42883") {
        throw new ReportError(
          "Monthly reports aren't set up yet. Run supabase/security_hardening_2026-10-28.sql in your Supabase SQL editor."
        );
      }
      console.error("[reports/finalize] RPC failed:", error.message);
      throw new ReportError("Could not finalize this month. Try again.");
    }

    return NextResponse.json({ success: true, rowsWritten: rowsWritten ?? 0 });
  } catch (err) {
    if (err instanceof ReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("POST /api/reports/finalize failed:", err);
    return NextResponse.json(
      { error: "Could not finalize this month." },
      { status: 500 }
    );
  }
}
