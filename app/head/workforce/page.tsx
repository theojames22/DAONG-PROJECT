import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Profile, Session, Output, WeekHours } from "@/lib/types";
import { totalHours } from "@/lib/attendance";
import {
  dateKeyIn,
  dayEndISO,
  dayStartISO,
  isValidDateKey,
  weekRangeForKey,
  weekRangeIn,
} from "@/lib/time";
import { getAppTimezone } from "@/lib/report/queries";
import WorkforceHeader from "@/components/head/workforce/WorkforceHeader";
import WorkforceView from "@/components/head/workforce/WorkforceView";
import { type AttendanceRow } from "@/components/head/workforce/AttendanceTable";
import styles from "./workforce.module.css";
import type { CSSProperties } from "react";

type OutputWithReviewer = Output & {
  reviewer: { full_name: string | null } | null;
};

/**
 * Unified Workforce page (Head only).
 *
 * Merges the former Team page (weekly summary + employee cards) and the
 * former Attendance page (daily attendance table) behind one route. The
 * active view is chosen with ?view=card|list (Card is the default) and the
 * attendance date with ?date=YYYY-MM-DD — so the old routes can redirect
 * here and land on the right tab, while in-page switching stays client-side.
 */
export default async function WorkforcePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; date?: string | string[] }>;
}) {
  let profile;
  let user;
  try {
    const auth = await getAuthenticatedProfile();
    profile = auth.profile;
    user = auth.user;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  if (profile.role !== USER_ROLES.HEAD) {
    redirect("/employee");
  }

  const supabase = await createClient();
  const resolvedSearchParams = await searchParams;
  const viewParam = Array.isArray(resolvedSearchParams.view)
    ? resolvedSearchParams.view[0]
    : resolvedSearchParams.view;
  const dateParam = Array.isArray(resolvedSearchParams.date)
    ? resolvedSearchParams.date[0]
    : resolvedSearchParams.date;
  const view: "card" | "list" = viewParam === "list" ? "list" : "card";

  const timezone = await getAppTimezone(supabase);
  const todayKey = dateKeyIn(timezone);
  const date =
    dateParam && isValidDateKey(dateParam) ? dateParam : todayKey;

  // Current week (for the leaderboard) and the selected date's week (for the
  // attendance table) — usually the same, fetched separately so a Head can
  // browse another week's attendance without shifting the leaderboard.
  const currentWeek = weekRangeIn(timezone);
  const selectedWeek = weekRangeForKey(date);
  const { start: weekStart, end: weekEnd } = currentWeek;
  const { start: selectedWeekStart, end: selectedWeekEnd } = selectedWeek;

  // Load only the sessions that either view can render: the union of the
  // current leadership week and the selected attendance week.
  const sessionsStart = dayStartISO(
    weekStart < selectedWeekStart ? weekStart : selectedWeekStart,
    timezone
  );
  const sessionsEnd = dayEndISO(
    weekEnd > selectedWeekEnd ? weekEnd : selectedWeekEnd,
    timezone
  );

  const [
    { data: profilesData },
    { data: sessionsData },
    { data: weekHoursData },
    { data: selectedWeekHoursData },
    { data: outputsData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, position, role, required_weekly_hours, profile_picture_url, qr_token"
      )
      .order("full_name"),
    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .gte("time_in", sessionsStart)
      .lte("time_in", sessionsEnd),
    supabase
      .from("employee_week_hours")
      .select(
        "employee_id, week_start, attendance_hours, credited_hours, attendance_days, credited_days"
      )
      .eq("week_start", weekStart),
    supabase
      .from("employee_week_hours")
      .select(
        "employee_id, week_start, attendance_hours, credited_hours, attendance_days, credited_days"
      )
      .eq("week_start", selectedWeekStart),
    supabase
      .from("outputs")
      .select(
        "id, employee_id, date, title, attachment_type, attachment_url, content, file_name, status, reviewer_notes, reviewed_by, created_at, reviewer:profiles!outputs_reviewed_by_fkey(full_name)"
      )
      .eq("date", date)
      .order("created_at", { ascending: false }),
  ]);

  const employees = (profilesData ?? []) as Profile[];
  const allSessions = (sessionsData ?? []) as Session[];
  const weekHours = (weekHoursData ?? []) as WeekHours[];
  const selectedWeekHours = (selectedWeekHoursData ?? []) as WeekHours[];
  const dateOutputs = (outputsData ?? []) as unknown as OutputWithReviewer[];

  // ---- Card View data: current-week credited hours + who is on the clock ----
  const creditedByEmployee: Record<string, number> = {};
  for (const row of weekHours) {
    creditedByEmployee[row.employee_id] = Number(row.credited_hours) || 0;
  }

  const activeEmployeeIds = Array.from(
    new Set(
      allSessions
        .filter(
          (s) => !s.time_out && dateKeyIn(timezone, new Date(s.time_in)) === todayKey
        )
        .map((s) => s.employee_id)
    )
  );

  // ---- List View data: attendance rows for the selected date/week ----
  const staff = employees.filter((e) => e.role === "staff");

  const creditedByEmployeeSelected = new Map<string, number>(
    selectedWeekHours.map((w) => [w.employee_id, Number(w.credited_hours) || 0])
  );

  const todayByEmployee = new Map<string, Session[]>();
  const weekByEmployee = new Map<string, Session[]>();
  for (const s of allSessions) {
    const key = dateKeyIn(timezone, new Date(s.time_in));
    if (key === date) {
      const arr = todayByEmployee.get(s.employee_id) ?? [];
      arr.push(s);
      todayByEmployee.set(s.employee_id, arr);
    }
    if (key >= selectedWeekStart && key <= selectedWeekEnd) {
      const arr = weekByEmployee.get(s.employee_id) ?? [];
      arr.push(s);
      weekByEmployee.set(s.employee_id, arr);
    }
  }

  const latestOutputByEmployee = new Map<string, OutputWithReviewer>();
  const outputCountByEmployee = new Map<string, number>();
  for (const o of dateOutputs) {
    if (!latestOutputByEmployee.has(o.employee_id)) {
      latestOutputByEmployee.set(o.employee_id, o);
    }
    outputCountByEmployee.set(
      o.employee_id,
      (outputCountByEmployee.get(o.employee_id) ?? 0) + 1
    );
  }

  const attendanceRows: AttendanceRow[] = staff.map((staffProfile) => {
    const eToday = todayByEmployee.get(staffProfile.id) ?? [];
    const eWeek = weekByEmployee.get(staffProfile.id) ?? [];
    const eOutputs = dateOutputs.filter((o) => o.employee_id === staffProfile.id);
    const latest = latestOutputByEmployee.get(staffProfile.id);

    const statusKind: AttendanceRow["statusKind"] =
      eToday.length === 0 ? "none" : eToday.some((s) => !s.time_out) ? "active" : "out";

    return {
      profile: staffProfile,
      statusKind,
      hoursToday: totalHours(eToday),
      hoursWeek: totalHours(eWeek),
      requiredWeeklyHours: staffProfile.required_weekly_hours || 40,
      creditedHours: creditedByEmployeeSelected.get(staffProfile.id) ?? 0,
      sessions: eToday,
      outputs: eOutputs,
      latestOutput: latest
        ? {
            id: latest.id,
            title: latest.title,
            status: latest.status,
            reviewerName: latest.reviewer?.full_name ?? null,
          }
        : null,
      outputCount: outputCountByEmployee.get(staffProfile.id) ?? 0,
    };
  });

  // Decorative background: 8 stacked wavy strokes fading .55 → .2.
  const waveOpacities = [0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2];
  const wavePath =
    "M0 40 C 180 6, 360 74, 540 40 C 720 6, 900 74, 1080 40 C 1260 6, 1440 74, 1620 40";

  return (
    <div className={`${styles.page} pb-12`}>
      {/* Soft, slowly drifting wave lines pinned to the page bottom. */}
      <div className={styles.waves} aria-hidden="true">
        <svg className={styles.wavesSvg} viewBox="0 0 1440 360" preserveAspectRatio="none">
          {waveOpacities.map((opacity, i) => (
            <path
              key={i}
              d={wavePath}
              transform={`translate(0 ${i * 34})`}
              className={styles.stroke}
              opacity={opacity}
            />
          ))}
        </svg>
      </div>

      <div className={styles.content}>
        {/* Shared header — present in both Card and List views */}
        <div className={styles.enter} style={{ "--wf-delay": "0s" } as CSSProperties}>
          <WorkforceHeader
            adminId={user.id}
            adminName={profile.full_name || "Head"}
            adminEmail={profile.email || null}
            adminAvatarUrl={profile.profile_picture_url || null}
            initialTheme={profile.theme_preference || "light"}
            adminPosition={profile.position || null}
          />
        </div>

        {/* Card View / List View */}
        <WorkforceView
          initialView={view}
          date={date}
          employees={employees}
          creditedByEmployee={creditedByEmployee}
          activeEmployeeIds={activeEmployeeIds}
          weekStart={weekStart}
          weekEnd={weekEnd}
          attendanceRows={attendanceRows}
        />
      </div>
    </div>
  );
}
