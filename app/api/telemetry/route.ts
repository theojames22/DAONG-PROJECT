import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getWeekRange,
  totalHours,
  creditedProgress,
  toDateKey,
  dayStartISO,
  dayEndISO,
} from "@/lib/attendance";
import { Session, Output, AttendanceDay, WeekHours } from "@/lib/types";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function sessionDurationHours(s: Session): number {
  const start = new Date(s.time_in).getTime();
  const end = s.time_out ? new Date(s.time_out).getTime() : Date.now();
  return (end - start) / 3_600_000;
}

export async function GET(request: Request) {
  const supabase = await createClient();

  // 1. Authenticate user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const selectedDate = dateParam || toDateKey(new Date().toISOString());

  // 3. Calculate week range for selectedDate
  const targetDate = new Date(selectedDate);
  const { start: weekStart, end: weekEnd, days: weekDaysKeys } = getWeekRange(targetDate);

  // 4. Fetch profile, the day's + week's sessions, the persisted
  //    attendance days for the same two windows, the credited-hours
  //    rollup, and outputs — all concurrently.
  const [
    { data: profile },
    { data: daySessionsRaw },
    { data: weekSessionsRaw },
    { data: dayAttendanceRaw },
    { data: weekAttendanceRaw },
    { data: weekHoursRaw },
    { data: outputsRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, position, role, required_weekly_hours")
      .eq("id", user.id)
      .single(),

    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .eq("employee_id", user.id)
      .gte("time_in", dayStartISO(selectedDate))
      .lte("time_in", dayEndISO(selectedDate))
      .order("time_in", { ascending: true }),

    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .eq("employee_id", user.id)
      .gte("time_in", dayStartISO(weekStart))
      .lte("time_in", dayEndISO(weekEnd))
      .order("time_in", { ascending: true }),

    // The durable attendance history, written by the sessions trigger.
    supabase
      .from("attendance_days")
      .select("employee_id, date, hours, session_count, first_in, last_out, has_open_session")
      .eq("employee_id", user.id)
      .eq("date", selectedDate)
      .maybeSingle(),

    supabase
      .from("attendance_days")
      .select("employee_id, date, hours, session_count, first_in, last_out, has_open_session")
      .eq("employee_id", user.id)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date", { ascending: true }),

    // Credited hours: attendance_days joined to approved outputs, rolled
    // up per week. The week_start this view uses is the Monday of the
    // week, matching getWeekRange().
    supabase
      .from("employee_week_hours")
      .select("employee_id, week_start, attendance_hours, credited_hours, attendance_days, credited_days")
      .eq("employee_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle(),

    // Explicit columns: `content` is deliberately NOT selected. This route
    // is polled every few seconds, so written bodies (up to 20k characters
    // each) would otherwise ride along on every request. The employee page
    // is the one place that needs a body, and it fetches it once.
    supabase
      .from("outputs")
      .select(
        "id, employee_id, date, title, attachment_type, attachment_url, status, reviewer_notes, reviewed_by, reviewed_at, storage_path, file_name, created_at"
      )
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const daySessions = (daySessionsRaw ?? []) as Session[];
  const weekSessions = (weekSessionsRaw ?? []) as Session[];
  const outputs = (outputsRaw ?? []) as Output[];
  const dayAttendance = (dayAttendanceRaw ?? null) as AttendanceDay | null;
  const weekAttendance = (weekAttendanceRaw ?? []) as AttendanceDay[];
  const weekHours = (weekHoursRaw ?? null) as WeekHours | null;

  // 5. Attendance hours — read from the persisted attendance_days rows.
  //    Falling back to a live totalHours() keeps the UI honest if the
  //    migration hasn't been applied yet (or a row somehow went missing)
  //    instead of silently showing 0.0h for a day that clearly has
  //    sessions. These numbers are the raw history: they are NOT the
  //    weekly requirement's yardstick.
  const hoursToday =
    dayAttendance?.hours ?? totalHours(daySessions);
  const hoursThisWeek =
    weekAttendance.length > 0
      ? weekAttendance.reduce((sum, d) => sum + Number(d.hours), 0)
      : weekHours?.attendance_hours ?? totalHours(weekSessions);

  // 6. Credited hours — the separate value that counts toward the weekly
  //    requirement. Only days with an approved output contribute, so a
  //    week of full attendance with no approved output credits 0/40.
  //    Derived, never incremented, so approvals can't double count.
  const requiredWeeklyHours = profile?.required_weekly_hours ?? 40;

  // The view is the source of truth. If it isn't reachable yet (migration
  // not applied), derive the identical number from the attendance days and
  // outputs we already fetched, so a partially-migrated database still
  // reports the truth instead of a flat zero.
  const approvedOutputDates = new Set(
    outputs.filter((o) => o.status === "done").map((o) => o.date)
  );
  const creditedHoursFallback = weekAttendance
    .filter((d) => approvedOutputDates.has(d.date) && !d.has_open_session)
    .reduce((sum, d) => sum + Number(d.hours), 0);

  const credited = creditedProgress(
    weekHours ? Number(weekHours.credited_hours) || 0 : creditedHoursFallback,
    requiredWeeklyHours
  );

  // 7. Check open session
  const openSession =
    daySessions.find((s) => !s.time_out) ||
    weekSessions.find((s) => !s.time_out) ||
    null;
  const isClockedIn = !!openSession;

  // 8. Format day sessions for table view
  const formattedDaySessions = daySessions.map((s, index) => {
    const duration = sessionDurationHours(s);
    return {
      id: s.id,
      sessionNumber: index + 1,
      timeIn: formatTime(s.time_in),
      timeOut: s.time_out ? formatTime(s.time_out) : "In Progress",
      duration: `${duration.toFixed(1)}h`,
      isOpen: !s.time_out,
      rawTimeIn: s.time_in,
      rawTimeOut: s.time_out,
    };
  });

  // 9. Build Monday - Friday telemetry array for the week
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const weekTelemetry = dayNames.map((name, i) => {
    const dateKey = weekDaysKeys[i];
    const d = new Date(dateKey);
    const dayCode = name.slice(0, 2).toUpperCase();
    const monthStr = d.toLocaleDateString("en-US", { month: "short" });
    const dayNum = d.getDate();
    const dateStr = `${name}, ${monthStr} ${dayNum}`;

    const sessionsForDay = weekSessions.filter((s) => toDateKey(s.time_in) === dateKey);
    const hours = totalHours(sessionsForDay);
    const hasOpen = sessionsForDay.some((s) => !s.time_out);

    let timeRange = "";
    let status: "verified" | "active" | "empty" = "empty";

    if (sessionsForDay.length > 0) {
      const firstIn = formatTime(sessionsForDay[0].time_in);
      const lastOut = sessionsForDay[sessionsForDay.length - 1].time_out
        ? formatTime(sessionsForDay[sessionsForDay.length - 1].time_out!)
        : null;

      if (hasOpen) {
        status = "active";
        timeRange = `Logged in at ${firstIn}`;
      } else {
        status = "verified";
        timeRange = `${firstIn} — ${lastOut || "05:00 PM"}`;
      }
    } else {
      timeRange = "No records found for this date";
      status = "empty";
    }

    return {
      code: dayCode,
      name,
      date: dateKey,
      dateStr,
      timeRange,
      hours,
      status,
      sessionCount: sessionsForDay.length,
      isSelected: dateKey === selectedDate,
    };
  });

  return NextResponse.json({
    selectedDate,
    isClockedIn,
    openSession,
    metrics: {
      // --- Attendance hours (raw history, never the requirement's metric) ---
      hoursToday,
      hoursThisWeek,
      requiredWeeklyHours,
      hoursLoggedPercent:
        requiredWeeklyHours > 0
          ? Math.min(Math.round((hoursThisWeek / requiredWeeklyHours) * 100), 100)
          : 0,
      coreShift: Math.min(hoursThisWeek, requiredWeeklyHours),
      standbyHours: hoursToday,
      overtimeHours: Math.max(0, hoursThisWeek - requiredWeeklyHours),
      // --- Credited hours (counts toward the weekly requirement) ---
      creditedHours: credited.creditedHours,
      creditedPercentMet: credited.percentMet,
      creditedRemainingHours: credited.remainingHours,
      creditedDays: weekHours?.credited_days ?? 0,
      attendanceDays: weekHours?.attendance_days ?? weekAttendance.length,
    },
    daySessions: formattedDaySessions,
    weekTelemetry,
    outputs,
    // The row written to attendance_days for the selected date — the
    // recorded attendance history, independent of any output.
    attendanceDay: dayAttendance
      ? {
          date: dayAttendance.date,
          hours: Number(dayAttendance.hours),
          sessionCount: dayAttendance.session_count,
          firstIn: dayAttendance.first_in,
          lastOut: dayAttendance.last_out,
          hasOpenSession: dayAttendance.has_open_session,
        }
      : null,
  });
}
