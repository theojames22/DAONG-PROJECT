import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { dayEndISO, dayStartISO, toDateKey } from "@/lib/attendance";
import type { Output, OutputStatus } from "@/lib/types";
import MyOutputsView from "@/components/employee/outputs/MyOutputsView";
import type { OutputCounts } from "@/components/employee/outputs/my-outputs-ui";

export const metadata = {
  title: "My Outputs — Daong",
  description: "Manage and track all your submitted outputs in one place.",
};

/**
 * List columns only — `content` is deliberately excluded.
 *
 * Written bodies can be up to 20k characters each, and this page keeps every
 * one of the staff member's rows in memory so search, filters and sort can run
 * instantly. Leaving the bodies out keeps that payload tiny; the visible
 * cards fetch what they need from /api/outputs/[id]/content, which is the
 * same RLS-guarded endpoint the review screens already use.
 */
const BASE_COLUMNS = [
  "id",
  "employee_id",
  "date",
  "title",
  "attachment_type",
  "attachment_url",
  "storage_path",
  "file_name",
  "status",
  "reviewer_notes",
  "reviewed_by",
  "created_at",
].join(", ");

/** Columns added by supabase/written_outputs.sql. */
const FULL_COLUMNS = `${BASE_COLUMNS}, submission_notes, reviewed_at, file_mime_type, file_size`;

export default async function MyOutputsPage() {
  let profile;
  let user;

  try {
    const result = await getAuthenticatedProfile();
    profile = result.profile;
    user = result.user;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  // Staff-only page. Heads have their own review queue under /head.
  if (profile.role !== USER_ROLES.STAFF) {
    redirect("/head");
  }

  const supabase = await createClient();
  const today = toDateKey(new Date().toISOString());

  // Three independent reads in one round trip. Every one is scoped to the
  // authenticated user id from the session — never to a client-supplied id —
  // and RLS ("Users can view their own outputs") enforces the same rule again.
  const [statusResult, listResult, sessionResult] = await Promise.all([
    supabase.from("outputs").select("status").eq("employee_id", user.id),

    supabase
      .from("outputs")
      .select(FULL_COLUMNS)
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("sessions")
      .select("id")
      .eq("employee_id", user.id)
      .gte("time_in", dayStartISO(today))
      .lte("time_in", dayEndISO(today))
      .limit(1),
  ]);

  let rows = (listResult.data ?? []) as unknown as Output[];
  let legacyColumns = false;
  let loadError: string | null = null;

  if (listResult.error) {
    // 42703 = undefined_column. If the written-outputs migration has not been
    // applied yet, retry once with only the columns that have always existed,
    // so the page still lists the staff member's work instead of failing.
    if (listResult.error.code === "42703") {
      const retry = await supabase
        .from("outputs")
        .select(BASE_COLUMNS)
        .eq("employee_id", user.id)
        .order("created_at", { ascending: false });

      if (retry.error) {
        console.error("[my-outputs] list query failed:", retry.error.message);
        loadError = "The outputs query failed.";
      } else {
        rows = (retry.data ?? []) as unknown as Output[];
        legacyColumns = true;
      }
    } else {
      console.error("[my-outputs] list query failed:", listResult.error.message);
      loadError = "The outputs query failed.";
    }
  }

  if (statusResult.error) {
    // Without the status rows the counts would be fiction, so the page shows
    // its error panel rather than a row of zeros.
    console.error("[my-outputs] status query failed:", statusResult.error.message);
    loadError = "The outputs count query failed.";
    rows = [];
  }

  const statusRows = (statusResult.data ?? []) as { status: OutputStatus }[];
  const counts: OutputCounts = {
    total: statusRows.length,
    pending: 0,
    checking: 0,
    approved: 0,
    rejected: 0,
  };

  for (const row of statusRows) {
    if (row.status === "pending") counts.pending += 1;
    else if (row.status === "checking") counts.checking += 1;
    else if (row.status === "done") counts.approved += 1;
    else if (row.status === "rejected") counts.rejected += 1;
  }

  // Same gate as the dashboard: submitting requires today's attendance.
  // A failed read falls back to "not clocked in" (the submit route enforces
  // the rule again server-side).
  if (sessionResult.error) {
    console.error("[my-outputs] session query failed:", sessionResult.error.message);
  }
  const clockedIn = (sessionResult.data ?? []).length > 0;

  return (
    <MyOutputsView
      profile={{
        id: user.id,
        full_name: profile.full_name,
        position: profile.position ?? null,
        role: profile.role,
        required_weekly_hours: profile.required_weekly_hours,
        profile_picture_url: profile.profile_picture_url ?? null,
        email: profile.email ?? user.email ?? null,
        theme_preference: profile.theme_preference ?? "light",
      }}
      outputs={rows}
      counts={counts}
      clockedIn={clockedIn}
      loadError={loadError}
      legacyColumns={legacyColumns}
    />
  );
}
