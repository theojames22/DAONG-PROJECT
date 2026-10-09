import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeekRange, totalHours, toDateKey } from "@/lib/attendance";
import { Session, Output } from "@/lib/types";

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

  // 4. Fetch profile, day's sessions, week's sessions, and outputs concurrently
  const [
    { data: profile },
    { data: daySessionsRaw },
    { data: weekSessionsRaw },
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
      .gte("time_in", `${selectedDate}T00:00:00`)
      .lte("time_in", `${selectedDate}T23:59:59`)
      .order("time_in", { ascending: true }),

    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .eq("employee_id", user.id)
      .gte("time_in", `${weekStart}T00:00:00`)
      .lte("time_in", `${weekEnd}T23:59:59`)
      .order("time_in", { ascending: true }),

    supabase
      .from("outputs")
      .select("*")
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const daySessions = (daySessionsRaw ?? []) as Session[];
  const weekSessions = (weekSessionsRaw ?? []) as Session[];
  const outputs = (outputsRaw ?? []) as Output[];

  // 5. Calculate Metrics
  const requiredWeeklyHours = profile?.required_weekly_hours ?? 40;
  const hoursThisWeek = totalHours(weekSessions);
  const hoursToday = totalHours(daySessions);

  const percentMet =
    requiredWeeklyHours > 0
      ? Math.min(Math.round((hoursThisWeek / requiredWeeklyHours) * 100), 100)
      : 0;

  const remainingHours = Math.max(0, requiredWeeklyHours - hoursThisWeek);
  const coreShift = Math.min(hoursThisWeek, requiredWeeklyHours);
  const standbyHours = hoursToday;
  const overtimeHours = Math.max(0, hoursThisWeek - requiredWeeklyHours);

  // 6. Check open session
  const openSession =
    daySessions.find((s) => !s.time_out) ||
    weekSessions.find((s) => !s.time_out) ||
    null;
  const isClockedIn = !!openSession;

  // 7. Format day sessions for table view
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

  // 8. Build Monday - Friday telemetry array for the week
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
      hoursToday,
      hoursThisWeek,
      requiredWeeklyHours,
      percentMet,
      remainingHours,
      coreShift,
      standbyHours,
      overtimeHours,
    },
    daySessions: formattedDaySessions,
    weekTelemetry,
    outputs,
  });
}
