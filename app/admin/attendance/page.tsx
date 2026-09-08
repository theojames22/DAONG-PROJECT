import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { getDayStatus, toDateKey, totalHours } from "@/lib/attendance";
import { Profile, Session, Output } from "@/lib/types";
import AttendanceTable, { AttendanceRow } from "@/components/admin/AttendanceTable";
import DatePicker from "@/components/admin/DatePicker";

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

  const supabase = createClient();
  const date = searchParams.date || toDateKey(new Date().toISOString());

  const [{ data: profiles }, { data: sessions }, { data: outputs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, position, role, required_weekly_hours")
      .eq("role", "employee")
      .order("full_name"),
    supabase.from("sessions").select("id, employee_id, time_in, time_out"),
    supabase
      .from("outputs")
      .select("id, employee_id, date, title, attachment_type, attachment_url, status, reviewer_notes")
      .eq("date", date),
  ]);

  const employees = (profiles ?? []) as Profile[];
  const allSessions = (sessions ?? []).filter(
    (s: Session) => toDateKey(s.time_in) === date
  ) as Session[];
  const allOutputs = (outputs ?? []) as Output[];

  const rows: AttendanceRow[] = employees.map((profile) => {
    const eSessions = allSessions.filter((s) => s.employee_id === profile.id);
    const eOutputs = allOutputs.filter((o) => o.employee_id === profile.id);
    return {
      profile,
      status: getDayStatus(eSessions, eOutputs),
      hours: totalHours(eSessions),
      sessions: eSessions,
      outputs: eOutputs,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Attendance</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Click a row to see every session and output for that day.
          </p>
        </div>

        <DatePicker date={date} />
      </div>

      <div className="neu-raised rounded-neu p-4">
        <AttendanceTable rows={rows} />
      </div>
    </div>
  );
}
