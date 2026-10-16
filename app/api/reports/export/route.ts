import { NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/report/session";
import { assembleMonthReport, ReportError, type ReportFilters } from "@/lib/report/queries";
import { buildCsv, buildXls, exportFileName } from "@/lib/report/export";

/**
 * GET /api/reports/export?format=csv|xls&month=&employee=&position=&status=
 *
 * Exports exactly the rows the table shows (month + employee +
 * position + compliance status filters). The current month is marked
 * provisional in the file name and in the "Result" column.
 */
export async function GET(request: Request) {
  const guard = await requireReportAccess();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "xls" ? "xls" : "csv";

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

    const rows = report.rows;
    const isFinalized = report.isFinalized;
    const filename = exportFileName(report.month, isFinalized, format);

    if (format === "xls") {
      const body = buildXls(rows, report.month, isFinalized);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const body = buildCsv(rows, report.month, isFinalized);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("GET /api/reports/export failed:", err);
    return NextResponse.json(
      { error: "Could not export the report." },
      { status: 500 }
    );
  }
}
