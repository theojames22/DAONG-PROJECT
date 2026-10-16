import { NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/report/session";
import { assembleMonthReport, ReportError, type ReportFilters } from "@/lib/report/queries";

/**
 * GET /api/reports/month?month=YYYY-MM&employee=&position=&status=
 *
 * Summary cards + report rows for one month. Summary figures are
 * computed from the employee and position filters only — the
 * compliance-status filter shapes the table, never the summaries.
 * Provisional months are live; closed months are finalized snapshots.
 */
export async function GET(request: Request) {
  const guard = await requireReportAccess();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const filters: ReportFilters = {
    month: searchParams.get("month") ?? "",
    employee: searchParams.get("employee") ?? "",
    position: searchParams.get("position") ?? "",
    status: searchParams.get("status") ?? "",
  };

  try {
    const report = await assembleMonthReport(
      guard.session.supabase,
      filters,
      guard.session.user.id
    );
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof ReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reports/month failed:", err);
    return NextResponse.json(
      { error: "Could not load the monthly report." },
      { status: 500 }
    );
  }
}
