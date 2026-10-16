import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { getWeekRange, toDateKey, totalHours, formatHours, dayStartISO, dayEndISO } from "@/lib/attendance";
import { Profile, Session, WeekHours } from "@/lib/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CompliancePage() {
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

  if (profile.role !== USER_ROLES.HEAD) {
    redirect("/employee");
  }

  const supabase = await createClient();
  const { start, end, days } = getWeekRange(new Date());

  const [{ data: profiles }, { data: sessions }, { data: weekHours }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, position, role, required_weekly_hours")
        .eq("role", "staff")
        .order("full_name"),
      supabase
        .from("sessions")
        .select("id, employee_id, time_in, time_out")
        .gte("time_in", dayStartISO(start))
        .lte("time_in", dayEndISO(end)),
      // Credited hours for this week — the slice of attendance that counts
      // toward each employee's requirement.
      supabase
        .from("employee_week_hours")
        .select("employee_id, week_start, attendance_hours, credited_hours, attendance_days, credited_days")
        .eq("week_start", start),
    ]);

  const employees = (profiles ?? []) as Profile[];
  const allSessions = (sessions ?? []) as Session[];
  const weekHoursRows = (weekHours ?? []) as WeekHours[];

  const creditedByEmployee = new Map<string, number>(
    weekHoursRows.map((w) => [w.employee_id, Number(w.credited_hours) || 0])
  );
  const attendanceByEmployee = new Map<string, number>(
    weekHoursRows.map((w) => [w.employee_id, Number(w.attendance_hours) || 0])
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Weekly Compliance</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {start} – {end}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          Total hours are attendance history. Credited hours are the part that
          counts toward each weekly requirement — a day is credited only once it
          has an approved output.
        </p>
      </div>

      <div className="neu-raised overflow-x-auto rounded-neu p-4">
        <table className="w-full min-w-[820px] border-separate border-spacing-y-1 text-[13px]">
          <thead>
            <tr className="text-left text-[12px] font-medium text-ink-muted">
              <th className="px-3 pb-2">Employee</th>
              {DAY_LABELS.map((d) => (
                <th key={d} className="px-2 pb-2 text-center">
                  {d}
                </th>
              ))}
              <th className="px-3 pb-2 text-right">Total</th>
              <th className="px-3 pb-2 text-right">Credited</th>
              <th className="px-3 pb-2 text-right">Required</th>
              <th className="px-3 pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-ink-muted">
                  No employees yet — add one from the Workforce page.
                </td>
              </tr>
            )}

            {employees.map((profile) => {
              const eSessions = allSessions.filter((s) => s.employee_id === profile.id);
              const weekTotal = totalHours(eSessions);

              // Two independent numbers: hours logged (raw record) and
              // hours credited (days with an approved output). Neither is
              // derived from the other.
              const credited = creditedByEmployee.get(profile.id) ?? 0;
              const required = profile.required_weekly_hours;
              const creditedMet = required > 0 && credited >= required;
              const creditedShort = Math.max(0, required - credited);

              return (
                <tr key={profile.id} className="neu-pressed">
                  <td className="rounded-l-xl px-3 py-3">
                    <p className="font-medium text-ink">{profile.full_name || "—"}</p>
                    <p className="text-[12px] text-ink-muted">{profile.position || "—"}</p>
                  </td>
                  {days.map((day) => {
                    const dayHours = totalHours(
                      eSessions.filter((s) => toDateKey(s.time_in) === day)
                    );
                    return (
                      <td key={day} className="px-2 py-3 text-center text-ink-muted">
                        {dayHours > 0 ? formatHours(dayHours) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right font-medium text-ink">
                    {formatHours(weekTotal)}
                    {attendanceByEmployee.has(profile.id) &&
                      Math.abs(Number(attendanceByEmployee.get(profile.id)) - weekTotal) > 0.05 && (
                        <span className="ml-1 text-[11.5px] font-medium text-ink-subtle">
                          rec {formatHours(Number(attendanceByEmployee.get(profile.id)))}
                        </span>
                      )}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-ink">
                    {formatHours(credited)}
                  </td>
                  <td className="px-3 py-3 text-right text-ink-muted">
                    {formatHours(required)}
                  </td>
                  <td className="rounded-r-xl px-3 py-3 text-right">
                    <span
                      className={
                        creditedMet
                          ? "text-[12.5px] font-medium text-[#3C6E44]"
                          : "text-[12.5px] font-medium text-[#9A3B3B]"
                      }
                    >
                      {creditedMet
                        ? "Met"
                        : `Short ${formatHours(creditedShort)}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
