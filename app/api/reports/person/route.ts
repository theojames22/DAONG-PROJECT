import { NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/report/session";
import { ReportError, getAppTimezone, fetchMonthDayRows } from "@/lib/report/queries";
import { buildReportRow, ReportDayRow } from "@/lib/report/aggregate";
import { currentMonthKey, dateKeyIn, monthEndKey, monthStartKey } from "@/lib/report/calc";

/** 'approved' (done), 'pending' (pending|checking), 'rejected', 'none'. */
export type OutputState = "approved" | "pending" | "rejected" | "none";

/**
 * GET /api/reports/person?month=YYYY-MM&user_id=<uuid>
 *
 * One person's attendance details for the drawer: the same numbers the
 * table shows, plus the per-day rows for the calendar and daily log.
 *
 * Provisional months read live rows; finalized months read the frozen
 * snapshot, including its per-day detail, so a closed month's drawer
 * cannot silently disagree with its totals or change after the fact.
 */
export async function GET(request: Request) {
  const guard = await requireReportAccess();
  if (!guard.ok) return guard.response;

  const { supabase } = guard.session;
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? "";
  const userId = searchParams.get("user_id") ?? "";

  if (!/^\d{4}-\d{2}$/.test(month) || !userId) {
    return NextResponse.json(
      { error: "A month and a user are required." },
      { status: 400 }
    );
  }

  try {
    const timezone = await getAppTimezone(supabase);
    const todayKey = dateKeyIn(timezone);
    const isCurrentMonth = month === currentMonthKey(todayKey);

    if (month > currentMonthKey(todayKey)) {
      throw new ReportError("That month hasn't happened yet.");
    }

    // Only Staff can be inspected — this also refuses ids that belong
    // to Heads (administrators) or don't exist at all.
    const { data: person, error: personError } = await supabase
      .from("profiles")
      .select("id, full_name, position, required_weekly_hours")
      .eq("id", userId)
      .eq("role", "staff")
      .single();

    if (personError || !person) {
      throw new ReportError("That person is not in the reports.", 404);
    }

    if (isCurrentMonth) {
      // Day rows come from the same shared fetcher the table uses, so
      // the drawer can never disagree with the row it was opened from.
      const [dayRows, { data: outputData }] = await Promise.all([
        fetchMonthDayRows(supabase, month, [userId]),
        supabase
          .from("outputs")
          .select("date, status")
          .eq("employee_id", userId)
          .gte("date", monthStartKey(month))
          .lte("date", monthEndKey(month)),
      ]);

      // Per-day output state, so the log can distinguish a pending
      // submission from no submission at all.
      const outputStateByDate = new Map<string, OutputState>();
      for (const entry of (outputData ?? []) as { date: string; status: string }[]) {
        const state: OutputState =
          entry.status === "done"
            ? "approved"
            : entry.status === "pending" || entry.status === "checking"
              ? "pending"
              : "rejected";
        const current = outputStateByDate.get(entry.date);
        // Strongest wins: approved > pending > rejected.
        if (state === "approved") outputStateByDate.set(entry.date, "approved");
        else if (state === "pending" && current !== "approved")
          outputStateByDate.set(entry.date, "pending");
        else if (!current) outputStateByDate.set(entry.date, state);
      }

      const days = dayRows.map((day) => ({
        ...day,
        output_status: outputStateByDate.get(day.date) ?? ("none" as OutputState),
      }));

      const row = buildReportRow(
        person as Parameters<typeof buildReportRow>[0],
        days,
        month,
        todayKey
      );

      return NextResponse.json({
        person,
        row,
        days,
        isCurrentMonth: true,
        isFinalized: false,
        finalizedAt: null,
        todayKey,
        timezone,
      });
    }

    // Closed month — finalize on demand, then read the frozen snapshot.
    const { error: finalizeError } = await supabase.rpc("finalize_month", {
      p_month: `${month}-01`,
    });
    if (finalizeError) {
      if (finalizeError.code === "42883") {
        throw new ReportError(
          "Monthly reports aren't set up yet. Run supabase/reports.sql in your Supabase SQL editor."
        );
      }
      throw new ReportError(
        finalizeError.message || "Could not finalize this month."
      );
    }

    const { data: snapshot, error: snapshotError } = await supabase
      .from("monthly_report_snapshots")
      .select("*")
      .eq("employee_id", userId)
      .eq("month", `${month}-01`)
      .single();

    if (snapshotError || !snapshot) {
      throw new ReportError("No finalized report for that month.", 404);
    }

    // Frozen per-day detail, shaped exactly like the live rows so the
    // drawer renders both regimes with the same code.
    const frozenDaily = Array.isArray(snapshot.daily) ? snapshot.daily : [];
    const days = frozenDaily.map((entry: Record<string, unknown>) => ({
      employee_id: userId,
      date: String(entry.date),
      hours: Number(entry.hours ?? 0),
      session_count: Number(entry.session_count ?? 0),
      has_open_session: Boolean(entry.has_open_session),
      has_output:
        entry.has_output === undefined ? undefined : Boolean(entry.has_output),
      has_approved_output: Boolean(entry.has_approved_output),
      is_credited: Boolean(entry.is_credited),
      output_status: (entry.output_status as OutputState) ?? "none",
      first_in: (entry.first_in as string) ?? null,
      last_out: (entry.last_out as string) ?? null,
    })) as ReportDayRow[];

    const requiredHours = Number(snapshot.required_hours ?? 0);
    const percent = Number(snapshot.compliance_percent ?? 0);

    return NextResponse.json({
      person,
      row: {
        employee_id: userId,
        full_name: person.full_name,
        position: person.position,
        required_hours: requiredHours,
        recorded_hours: Number(snapshot.recorded_hours ?? 0),
        credited_hours: Number(snapshot.credited_hours ?? 0),
        compliance_percent: percent,
        status: snapshot.status,
        days_recorded: Number(snapshot.days_recorded ?? 0),
        elapsed_working_days: Number(snapshot.working_days ?? 0),
        working_days: Number(snapshot.working_days ?? 0),
        missing_days: Number(snapshot.missing_days ?? 0),
        incomplete_records: Number(snapshot.incomplete_records ?? 0),
      },
      days,
      isCurrentMonth: false,
      isFinalized: true,
      finalizedAt: snapshot.finalized_at ?? null,
      todayKey,
      timezone,
    });
  } catch (err) {
    if (err instanceof ReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reports/person failed:", err);
    return NextResponse.json(
      { error: "Could not load this person's report." },
      { status: 500 }
    );
  }
}
