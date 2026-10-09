import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { toDateKey, totalHours, getWeekRange } from "@/lib/attendance";
import { Profile, Session, Output } from "@/lib/types";
import AttendanceTable, { AttendanceRow } from "@/components/admin/AttendanceTable";
import AttendanceActions from "@/components/admin/AttendanceActions";
import DatePicker from "@/components/admin/DatePicker";
import { Suspense } from "react";

type OutputWithReviewer = Output & {
  reviewer: { full_name: string | null } | null;
};

async function AttendanceContent({
  date,
}: {
  date: string;
}) {
  const supabase = await createClient();

  const [{ data: profiles }, { data: sessions }, { data: outputs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, position, role, required_weekly_hours, profile_picture_url")
      .eq("role", "employee")
      .order("full_name"),
    // All sessions: today's rows drive hours + status, the week drives progress.
    supabase.from("sessions").select("id, employee_id, time_in, time_out"),
    supabase
      .from("outputs")
      .select(
        "id, employee_id, date, title, attachment_type, attachment_url, status, reviewer_notes, reviewed_by, created_at, reviewer:profiles!outputs_reviewed_by_fkey(full_name)"
      )
      .eq("date", date)
      .order("created_at", { ascending: false }),
  ]);

  const employees = (profiles ?? []) as Profile[];
  const allSessions = (sessions ?? []) as Session[];
  const dateOutputs = (outputs ?? []) as unknown as OutputWithReviewer[];

  // Monday–Sunday window containing the selected date.
  const { start, end } = getWeekRange(new Date(`${date}T00:00:00`));

  // Group today's and this week's sessions per employee in one pass.
  const todayByEmployee = new Map<string, Session[]>();
  const weekByEmployee = new Map<string, Session[]>();
  for (const s of allSessions) {
    const key = toDateKey(s.time_in);
    if (key === date) {
      const arr = todayByEmployee.get(s.employee_id) ?? [];
      arr.push(s);
      todayByEmployee.set(s.employee_id, arr);
    }
    if (key >= start && key <= end) {
      const arr = weekByEmployee.get(s.employee_id) ?? [];
      arr.push(s);
      weekByEmployee.set(s.employee_id, arr);
    }
  }

  // Latest output per employee (already sorted newest first).
  const latestOutputByEmployee = new Map<string, OutputWithReviewer>();
  const outputCountByEmployee = new Map<string, number>();
  for (const o of dateOutputs) {
    if (!latestOutputByEmployee.has(o.employee_id)) {
      latestOutputByEmployee.set(o.employee_id, o);
    }
    outputCountByEmployee.set(o.employee_id, (outputCountByEmployee.get(o.employee_id) ?? 0) + 1);
  }

  // Every employee is always listed — staff with no time-in show placeholders.
  const rows: AttendanceRow[] = employees.map((profile) => {
    const eToday = todayByEmployee.get(profile.id) ?? [];
    const eWeek = weekByEmployee.get(profile.id) ?? [];
    const eOutputs = dateOutputs.filter((o) => o.employee_id === profile.id);
    const latest = latestOutputByEmployee.get(profile.id);

    const statusKind: AttendanceRow["statusKind"] =
      eToday.length === 0 ? "none" : eToday.some((s) => !s.time_out) ? "active" : "out";

    return {
      profile,
      statusKind,
      hoursToday: totalHours(eToday),
      hoursWeek: totalHours(eWeek),
      requiredWeeklyHours: profile.required_weekly_hours || 40,
      sessions: eToday,
      outputs: eOutputs,
      latestOutput: latest
        ? {
            title: latest.title,
            status: latest.status,
            reviewerName: latest.reviewer?.full_name ?? null,
          }
        : null,
      outputCount: outputCountByEmployee.get(profile.id) ?? 0,
    };
  });

  return (
    <div className="neu-raised rounded-neu p-3 sm:p-4">
      <AttendanceTable rows={rows} />
    </div>
  );
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  let profile;
  try {
    const { profile: p } = await getAuthenticatedProfile();
    profile = p;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  if (profile.role !== USER_ROLES.ADMIN) {
    redirect("/employee");
  }

  const date = searchParams.date || toDateKey(new Date().toISOString());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Attendance</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Scan staff QR codes to record time-in and time-out. Progress updates live.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DatePicker date={date} />
          <AttendanceActions />
        </div>
      </div>

      <Suspense
        key={date}
        fallback={
          <div className="neu-raised rounded-neu p-4 animate-pulse flex flex-col gap-4">
            <div className="h-16 w-full bg-accent-soft/30 rounded-xl" />
            <div className="h-16 w-full bg-accent-soft/30 rounded-xl" />
            <div className="h-16 w-full bg-accent-soft/30 rounded-xl" />
            <div className="h-16 w-full bg-accent-soft/30 rounded-xl" />
          </div>
        }
      >
        <AttendanceContent date={date} />
      </Suspense>
    </div>
  );
}
