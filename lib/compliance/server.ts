import type { SupabaseClient } from "@supabase/supabase-js";
import { dateKeyIn } from "@/lib/report/calc";
import { getAppTimezone } from "@/lib/report/queries";
import type { Session, WeekHours } from "@/lib/types";
import {
  DAILY_BAR_SCALE,
  completedWorkdays,
  complianceStatus,
  dateNumber,
  dayLabel,
  endOfWeekUtc,
  formatDayDate,
  formatWeekLabel,
  formatWeekShortLabel,
  initialsFor,
  isValidDateKey,
  isWorkdayIndex,
  isoWeekNumber,
  mondayOf,
  shiftDateKey,
  startOfDayUtc,
  statusCaption,
  statusLabel,
  weekDays,
} from "./helpers";
import type {
  ComplianceDay,
  ComplianceDayCell,
  ComplianceEmployee,
  ComplianceTeam,
  WeeklyCompliancePayload,
} from "./types";

interface StaffRow {
  id: string;
  full_name: string | null;
  position: string | null;
  required_weekly_hours: number | null;
  profile_picture_url?: string | null;
}

export interface BuildWeeklyComplianceOptions {
  /** Any date in the requested week; invalid/future values clamp to now. */
  week?: string | null;
  /** The app timezone. Passed in by callers that already read it. */
  timezone?: string;
  /** Primarily for deterministic tests. */
  now?: Date;
}

export function normalizeWeekStart(
  requested: string | null | undefined,
  currentWeekStart: string
): string {
  if (!isValidDateKey(requested)) return currentWeekStart;
  const start = mondayOf(requested);
  return start > currentWeekStart ? currentWeekStart : start;
}

/**
 * Builds one week of real Weekly Compliance data.
 *
 * This function is the single source of truth for both the server-rendered
 * first paint and the client's week/live refreshes. It reads:
 *   profiles              → names, positions, avatars, weekly requirements
 *   employee_week_hours   → credited hours (the compliance metric)
 *   sessions              → logged hours and the seven daily bars
 *
 * Credited hours never come from sessions: a day counts only when it has a
 * submitted output, exactly as the rest of Daong does.
 */
export async function buildWeeklyCompliance(
  supabase: SupabaseClient,
  options: BuildWeeklyComplianceOptions = {}
): Promise<WeeklyCompliancePayload> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const timezone = options.timezone ?? (await getAppTimezone(supabase));
  const todayKey = dateKeyIn(timezone, now);
  const currentWeekStart = mondayOf(todayKey);
  const weekStart = normalizeWeekStart(options.week, currentWeekStart);
  const weekEnd = shiftDateKey(weekStart, 6);
  const isCurrentWeek = weekStart === currentWeekStart;
  const days = weekDays(weekStart);
  const completed = completedWorkdays(weekStart, todayKey, isCurrentWeek);

  const weekStartUtc = startOfDayUtc(weekStart, timezone).toISOString();
  const weekEndUtc = startOfDayUtc(
    shiftDateKey(weekEnd, 1),
    timezone
  ).toISOString();

  const [
    { data: profilesData, error: profilesError },
    { data: weekHoursData, error: weekHoursError },
    { data: sessionsData, error: sessionsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, position, required_weekly_hours, profile_picture_url"
      )
      .eq("role", "staff")
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_week_hours")
      .select(
        "employee_id, week_start, attendance_hours, credited_hours, attendance_days, credited_days"
      )
      .eq("week_start", weekStart),
    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .gte("time_in", weekStartUtc)
      .lt("time_in", weekEndUtc),
  ]);

  if (profilesError) throw new Error(profilesError.message);
  if (weekHoursError) throw new Error(weekHoursError.message);
  if (sessionsError) throw new Error(sessionsError.message);

  const staff = (profilesData ?? []) as StaffRow[];
  const weekHoursRows = (weekHoursData ?? []) as WeekHours[];
  const sessions = (sessionsData ?? []) as Session[];

  const creditedByEmployee = new Map<string, number>();
  for (const row of weekHoursRows) {
    creditedByEmployee.set(row.employee_id, Number(row.credited_hours) || 0);
  }

  const sessionsByEmployee = new Map<string, Session[]>();
  for (const session of sessions) {
    const list = sessionsByEmployee.get(session.employee_id) ?? [];
    list.push(session);
    sessionsByEmployee.set(session.employee_id, list);
  }

  const dayTotals = days.map(() => 0);
  const employees: ComplianceEmployee[] = [];

  for (const person of staff) {
    const personSessions = sessionsByEmployee.get(person.id) ?? [];
    const loggedHours = personSessions.reduce(
      (sum, session) => sum + sessionHours(session, nowMs),
      0
    );
    const creditedHours = creditedByEmployee.get(person.id) ?? 0;
    const requiredHours = Number(person.required_weekly_hours) || 0;
    const remainingHours =
      requiredHours > 0 ? Math.max(0, requiredHours - creditedHours) : 0;
    const dailyTarget = requiredHours > 0 ? requiredHours / 5 : 0;
    const expectedHours =
      requiredHours > 0
        ? Math.min(requiredHours, (requiredHours * completed) / 5)
        : 0;
    const percent =
      requiredHours > 0 ? (creditedHours / requiredHours) * 100 : 0;
    const status = complianceStatus(creditedHours, requiredHours, {
      isCurrentWeek,
      expectedHours,
      dailyTarget,
    });
    const isOnClock =
      isCurrentWeek &&
      personSessions.some(
        (session) =>
          !session.time_out &&
          dateKeyIn(timezone, new Date(session.time_in)) === todayKey
      );

    const hoursByDay = new Map<string, number>();
    for (const session of personSessions) {
      const key = dateKeyIn(timezone, new Date(session.time_in));
      hoursByDay.set(
        key,
        (hoursByDay.get(key) ?? 0) + sessionHours(session, nowMs)
      );
    }

    const cells: ComplianceDayCell[] = days.map((date, index) => {
      const hours = hoursByDay.get(date) ?? 0;
      dayTotals[index] += hours;
      return {
        date,
        label: dayLabel(index),
        dateLabel: formatDayDate(date),
        hours,
        hasRecord: hours > 1e-6,
        isToday: isCurrentWeek && date === todayKey,
        isFuture: isCurrentWeek && date > todayKey,
        isWorkday: isWorkdayIndex(index),
      };
    });

    employees.push({
      id: person.id,
      name: person.full_name || "Unnamed staff",
      position: person.position || "Staff",
      avatarUrl: person.profile_picture_url || null,
      initials: initialsFor(person.full_name || "?"),
      requiredHours,
      creditedHours,
      loggedHours,
      remainingHours,
      percent,
      expectedHours,
      dailyTarget,
      status,
      statusGroup:
        status === "met"
          ? "met"
          : status === "on_pace"
            ? "track"
            : status === "no_target"
              ? "na"
              : "attn",
      statusLabel: statusLabel(status, remainingHours),
      caption: statusCaption(
        status,
        creditedHours,
        requiredHours,
        remainingHours
      ),
      isOnClock,
      days: cells,
    });
  }

  const tracked = employees.filter((employee) => employee.requiredHours > 0);
  const requiredHours = tracked.reduce(
    (sum, employee) => sum + employee.requiredHours,
    0
  );
  const creditedHours = tracked.reduce(
    (sum, employee) => sum + employee.creditedHours,
    0
  );
  const loggedHours = employees.reduce(
    (sum, employee) => sum + employee.loggedHours,
    0
  );
  const dailyTarget = requiredHours > 0 ? requiredHours / 5 : 0;
  const expectedHours = isCurrentWeek
    ? Math.min(requiredHours, (requiredHours * completed) / 5)
    : requiredHours;
  const uniqueRequired = uniqueValue(
    tracked.map((employee) => employee.requiredHours)
  );
  const uniqueDailyTarget = uniqueValue(
    tracked.map((employee) => employee.dailyTarget)
  );

  const team: ComplianceTeam = {
    staffCount: employees.length,
    trackedCount: tracked.length,
    loggedHours,
    requiredHours,
    creditedHours,
    percent: requiredHours > 0 ? (creditedHours / requiredHours) * 100 : 0,
    belowCount: tracked.filter(
      (employee) => employee.creditedHours < employee.requiredHours
    ).length,
    remainingHours: Math.max(0, requiredHours - creditedHours),
    dailyTarget,
    expectedHours,
    gapHours: loggedHours - expectedHours,
    uniformRequired: uniqueRequired,
    uniformDailyTarget: uniqueDailyTarget,
    completedWorkdays: completed,
    dailyBarScale: DAILY_BAR_SCALE,
    dailyTotals: dayTotals,
  };

  const dayRows: ComplianceDay[] = days.map((key, index) => ({
    key,
    label: dayLabel(index),
    dateLabel: formatDayDate(key),
    dateNumber: dateNumber(key),
    isToday: isCurrentWeek && key === todayKey,
    isFuture: isCurrentWeek && key > todayKey,
    isWorkday: isWorkdayIndex(index),
  }));

  return {
    weekStart,
    weekEnd,
    weekLabel: formatWeekLabel(weekStart, weekEnd),
    weekShortLabel: formatWeekShortLabel(weekStart, weekEnd),
    weekNumber: isoWeekNumber(weekStart),
    navLabel: isCurrentWeek
      ? "This week"
      : formatWeekShortLabel(weekStart, weekEnd),
    currentWeekStart,
    todayKey,
    timezone,
    isCurrentWeek,
    weekEndsAt: isCurrentWeek ? endOfWeekUtc(weekEnd, timezone).toISOString() : null,
    generatedAt: now.toISOString(),
    days: dayRows,
    team,
    employees,
  };
}

function sessionHours(session: Session, nowMs: number): number {
  const start = new Date(session.time_in).getTime();
  const end = session.time_out
    ? new Date(session.time_out).getTime()
    : nowMs;
  return (end - start) / 3_600_000;
}

function uniqueValue(values: number[]): number | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((value) => Math.abs(value - first) < 1e-6) ? first : null;
}
