import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import {
  formatWeekBadge,
  getDayStatus,
  totalHours,
} from "@/lib/attendance";
import {
  addDaysToKey,
  dateKeyIn,
  dayEndISO,
  dayStartISO,
  isValidDateKey,
  weekRangeForKey,
  weekRangeIn,
} from "@/lib/time";
import { getAppTimezone } from "@/lib/report/queries";
import { Profile, Session, Output, WeekHours } from "@/lib/types";
import DashboardHeader from "@/components/head/dashboard/DashboardHeader";
import TodayAttendanceCard from "@/components/head/dashboard/TodayAttendanceCard";
import NeedsAttentionCard from "@/components/head/dashboard/NeedsAttentionCard";
import OutputsToReviewCard from "@/components/head/dashboard/OutputsToReviewCard";
import TimelineCard, {
  type TimelineEmployee,
  type TimelineSession,
} from "@/components/head/dashboard/TimelineCard";
import NeedsAttentionTable, {
  type NeedsAttentionRow,
} from "@/components/head/dashboard/NeedsAttentionTable";
import WeeklyLeaderboardCard, {
  type LeaderboardEntry,
} from "@/components/head/dashboard/WeeklyLeaderboardCard";
import DashboardLiveSync from "@/components/head/dashboard/DashboardLiveSync";

export default async function HeadPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  let profile;
  let viewerId = "";
  try {
    const { profile: p, user: u } = await getAuthenticatedProfile();
    profile = p;
    viewerId = u.id;
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

  // The app's configured timezone (app_settings.timezone) is the same clock
  // the database trigger and reports use. Resolve it before calculating the
  // week, otherwise a UTC server would show last week every Monday morning
  // in Manila.
  const timezone = await getAppTimezone(supabase);
  const today = dateKeyIn(timezone);
  const currentWeek = weekRangeIn(timezone);
  const resolvedSearchParams = await searchParams;
  const weekParam = Array.isArray(resolvedSearchParams.week)
    ? resolvedSearchParams.week[0]
    : resolvedSearchParams.week;

  // Selected week (drives the Weekly Leaderboard). Invalid or future weeks
  // fall back to the current one instead of reaching the database as NaN.
  const requestedWeek =
    weekParam && isValidDateKey(weekParam)
      ? weekRangeForKey(weekParam)
      : currentWeek;
  const selectedWeek =
    requestedWeek.start > currentWeek.start ? currentWeek : requestedWeek;
  const weekStart = selectedWeek.start;
  const weekEnd = selectedWeek.end;

  const todayStart = dayStartISO(today, timezone);
  const todayEnd = dayEndISO(today, timezone);

  const [
    { data: profiles, error: profilesError },
    { data: sessions, error: sessionsError },
    { data: outputs, error: outputsError },
    { data: weekHours, error: weekHoursError },
    { count: pendingReviewTotal, error: pendingReviewError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, position, role, required_weekly_hours, profile_picture_url")
      .eq("role", "staff")
      .order("full_name"),
    // Only today's attendance is needed by the dashboard. Loading every
    // session ever recorded made the page slower every month.
    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .gte("time_in", todayStart)
      .lte("time_in", todayEnd),
    supabase
      .from("outputs")
      .select(
        "id, employee_id, date, title, attachment_type, attachment_url, status, reviewer_notes, created_at"
      )
      .eq("date", today)
      .order("created_at", { ascending: false }),
    // Credited hours for the selected week — the canonical
    // attendance_days ⋈ submitted-outputs figure, never raw logged time.
    supabase
      .from("employee_week_hours")
      .select("employee_id, week_start, credited_hours, attendance_hours")
      .eq("week_start", weekStart),
    // The review count is a count query, not the entire outputs table.
    supabase
      .from("outputs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "checking"]),
  ]);

  const dayKeyOf = (iso: string) => dateKeyIn(timezone, new Date(iso));

  const employees = (profiles ?? []) as Profile[];
  const allSessions = (sessions ?? []) as Session[];
  const allOutputs = (outputs ?? []) as Output[];
  const weekHoursRows = (weekHours ?? []) as WeekHours[];

  const creditedByEmployee = new Map<string, number>(
    weekHoursRows.map((w) => [w.employee_id, Number(w.credited_hours) || 0])
  );

  const todaysSessionsByEmployee = new Map<string, Session[]>();
  for (const s of allSessions) {
    if (dayKeyOf(s.time_in) !== today) continue;
    const arr = todaysSessionsByEmployee.get(s.employee_id) ?? [];
    arr.push(s);
    todaysSessionsByEmployee.set(s.employee_id, arr);
  }

  // The sessions query has no ORDER BY, so sort each employee's day here.
  // This is what makes "Time in" the first punch and "Time out" the last
  // one, and what orders the timeline segments chronologically.
  for (const [employeeId, list] of todaysSessionsByEmployee) {
    list.sort((a, b) => new Date(a.time_in).getTime() - new Date(b.time_in).getTime());
    todaysSessionsByEmployee.set(employeeId, list);
  }

  const todaysOutputsByEmployee = new Map<string, Output[]>();
  for (const o of allOutputs) {
    if (o.date !== today) continue;
    const arr = todaysOutputsByEmployee.get(o.employee_id) ?? [];
    arr.push(o);
    todaysOutputsByEmployee.set(o.employee_id, arr);
  }

  const rows = employees.map((e) => {
    const eSessions = todaysSessionsByEmployee.get(e.id) ?? [];
    const eOutputs = todaysOutputsByEmployee.get(e.id) ?? [];
    return {
      profile: e,
      sessions: eSessions,
      outputs: eOutputs,
      status: getDayStatus(eSessions, eOutputs),
      hours: totalHours(eSessions),
    };
  });

  // Presence is driven by actual clock-in records from the database:
  // anyone with at least one session today counts as present — whether
  // they are still on the clock or have already clocked out — and each
  // employee is counted exactly once (rows are one per employee and
  // sessions are grouped per employee).
  const presentCount = rows.filter((r) => r.sessions.length > 0).length;
  const absentCount = rows.filter((r) => r.sessions.length === 0).length;

  // Needs attention = clocked in AND clocked out today with no output
  // submitted for today. getDayStatus "unverified" is exactly that: at least
  // one session, every session closed, and no output. "incomplete" (still
  // clocked in), "present" (an output exists, even if it is awaiting
  // approval) and "absent" are all excluded — this section is about missing
  // submissions, not pending approvals or open shifts.
  const needsAttention = rows.filter((r) => r.status === "unverified");
  // Still awaiting a decision across all open months. This is a count query
  // rather than a full-table read, so the card does not grow without bound.
  if (pendingReviewError) {
    console.error("[head] pending review count failed:", pendingReviewError.message);
  }
  const pendingReviewCount = pendingReviewTotal ?? 0;

  // ---- Timeline: today's sessions per employee, oldest first. ----
  // Heads are administrators and do not clock in/out, so only Staff
  // appear on the timeline.
  const timelineEmployees: TimelineEmployee[] = employees.map((e) => ({
    id: e.id,
    full_name: e.full_name,
    position: e.position,
    profile_picture_url: e.profile_picture_url,
  }));

  const sessionsByEmployee: Record<string, TimelineSession[]> = {};
  for (const employee of timelineEmployees) {
    sessionsByEmployee[employee.id] = (todaysSessionsByEmployee.get(employee.id) ?? []).map(
      (s) => ({ time_in: s.time_in, time_out: s.time_out })
    );
  }

  // ---- Needs attention table rows. ----
  // Each row here has clocked in and out today with no output submitted, so
  // the Output column is always the "Missing output" indicator.
  const attentionRows: NeedsAttentionRow[] = needsAttention.map((r) => ({
    id: r.profile.id,
    full_name: r.profile.full_name,
    position: r.profile.position,
    profile_picture_url: r.profile.profile_picture_url,
    sessions: r.sessions.map((s) => ({ time_in: s.time_in, time_out: s.time_out })),
    totalHours: r.hours,
  }));

  // ---- Weekly leaderboard (selected week, Staff only) ----
  // Ranked by CREDITED hours from employee_week_hours — attendance hours on
  // days that carry a submitted output — never raw logged time. Heads never
  // appear because `employees` is already scoped to role='staff'.
  const leaderboardEntries: LeaderboardEntry[] = employees
    .map((e) => ({
      id: e.id,
      full_name: e.full_name,
      position: e.position,
      profile_picture_url: e.profile_picture_url ?? null,
      creditedHours: creditedByEmployee.get(e.id) ?? 0,
      requiredHours: e.required_weekly_hours ?? 0,
    }))
    // Only Staff with eligible credited hours are ranked — a recorded day
    // with no submission is not a credited hour, and zero-credit Staff are
    // omitted rather than shown as placeholders.
    .filter((entry) => entry.creditedHours > 0)
    .sort((a, b) => {
      if (b.creditedHours !== a.creditedHours) {
        return b.creditedHours - a.creditedHours;
      }
      // Ties keep a stable, alphabetical display order (rank is shared).
      return (a.full_name || "").localeCompare(b.full_name || "");
    })
    // Leaderboard shows the top three only.
    .slice(0, 3);

  const weekLabel = formatWeekBadge(weekStart, weekEnd);
  // Each card owns the queries it actually reads. A failed profile read makes
  // the present/absent split unknowable; a failed output read makes the
  // review count unknowable; the leaderboard only needs profiles + credits.
  const todayAttendanceError = Boolean(profilesError || sessionsError);
  const outputsToReviewError = Boolean(pendingReviewError);
  const leaderboardError = Boolean(profilesError || weekHoursError);
  // If today's attendance/output reads failed, the Needs Attention section
  // must say so rather than claim "All clear".
  const needsAttentionError = Boolean(profilesError || sessionsError || outputsError);

  const headName = profile.full_name || "Head";

  return (
    <div className="flex w-full flex-col gap-6 pb-8">
      {/* Live sync — refreshes every card when attendance records change. */}
      <DashboardLiveSync />
      <DashboardHeader
        adminName={headName}
        title="Head dashboard"
        description="Monitor attendance, employees, and outputs across your team."
        adminId={viewerId}
        adminEmail={profile.email ?? null}
        adminAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={profile.theme_preference ?? "light"}
        adminPosition={profile.position ?? null}
      />

      {/* Top summary cards (3 columns) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <TodayAttendanceCard
          presentCount={presentCount}
          absentCount={absentCount}
          totalEmployees={employees.length}
          error={todayAttendanceError}
        />
        <NeedsAttentionCard count={needsAttention.length} error={needsAttentionError} />
        <OutputsToReviewCard count={pendingReviewCount} error={outputsToReviewError} />
      </div>

      {/* 24-hour attendance timeline */}
      <TimelineCard
        employees={timelineEmployees}
        sessionsByEmployee={sessionsByEmployee}
        timezone={timezone}
      />

      {/* Needs attention + weekly leaderboard (2 columns) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NeedsAttentionTable
          rows={attentionRows}
          error={needsAttentionError}
          timezone={timezone}
        />
        <WeeklyLeaderboardCard
          entries={leaderboardEntries}
          weekLabel={weekLabel}
          prevWeek={addDaysToKey(weekStart, -7)}
          nextWeek={addDaysToKey(weekStart, 7)}
          canGoNext={weekStart < currentWeek.start}
          error={leaderboardError}
        />
      </div>
    </div>
  );
}
