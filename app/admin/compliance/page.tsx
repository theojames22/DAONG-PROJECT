import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { getWeekRange, toDateKey, totalHours, formatHours } from "@/lib/attendance";
import { Profile, Session } from "@/lib/types";

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

  if (profile.role !== USER_ROLES.ADMIN) {
    redirect("/employee");
  }

  const supabase = createClient();
  const { start, end, days } = getWeekRange(new Date());

  const [{ data: profiles }, { data: sessions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, position, role, required_weekly_hours")
      .eq("role", "employee")
      .order("full_name"),
    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .gte("time_in", `${start}T00:00:00`)
      .lte("time_in", `${end}T23:59:59`),
  ]);

  const employees = (profiles ?? []) as Profile[];
  const allSessions = (sessions ?? []) as Session[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Weekly Compliance</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {start} – {end}
        </p>
      </div>

      <div className="neu-raised overflow-x-auto rounded-neu p-4">
        <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-[13px]">
          <thead>
            <tr className="text-left text-[12px] font-medium text-ink-muted">
              <th className="px-3 pb-2">Employee</th>
              {DAY_LABELS.map((d) => (
                <th key={d} className="px-2 pb-2 text-center">
                  {d}
                </th>
              ))}
              <th className="px-3 pb-2 text-right">Total</th>
              <th className="px-3 pb-2 text-right">Required</th>
              <th className="px-3 pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-ink-muted">
                  No employees yet — add one from the Team page.
                </td>
              </tr>
            )}

            {employees.map((profile) => {
              const eSessions = allSessions.filter((s) => s.employee_id === profile.id);
              const weekTotal = totalHours(eSessions);
              const met = weekTotal >= profile.required_weekly_hours;

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
                  </td>
                  <td className="px-3 py-3 text-right text-ink-muted">
                    {formatHours(profile.required_weekly_hours)}
                  </td>
                  <td className="rounded-r-xl px-3 py-3 text-right">
                    <span
                      className={
                        met
                          ? "text-[12.5px] font-medium text-[#3C6E44]"
                          : "text-[12.5px] font-medium text-[#9A3B3B]"
                      }
                    >
                      {met
                        ? "Met"
                        : `Short ${formatHours(profile.required_weekly_hours - weekTotal)}`}
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
