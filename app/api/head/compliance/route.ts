import { NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/report/session";
import { buildWeeklyCompliance } from "@/lib/compliance/server";

/**
 * GET /api/head/compliance?week=YYYY-MM-DD
 *
 * The selected week's real compliance payload. Heads only. Week changes are
 * fetched client-side so the page keeps its search/filter state and its
 * bars/rings transition instead of remounting and replaying entrance
 * animations.
 */
export async function GET(request: Request) {
  const guard = await requireReportAccess();
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const payload = await buildWeeklyCompliance(guard.session.supabase, {
      week: searchParams.get("week"),
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /api/head/compliance failed:", error);
    return NextResponse.json(
      { error: "Could not load weekly compliance." },
      { status: 500 }
    );
  }
}
