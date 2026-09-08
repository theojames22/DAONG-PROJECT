import { redirect } from "next/navigation";
import { UserCheck, UserX, AlertTriangle, FileClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { getDayStatus, toDateKey, formatHours, totalHours } from "@/lib/attendance";
import { Profile, Session, Output } from "@/lib/types";
import { DayStatusPill } from "@/components/StatusPill";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";

export default async function AdminPage() {
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
  const today = toDateKey(new Date().toISOString());

  const [{ data: profiles }, { data: sessions }, { data: outputs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, position, role, required_weekly_hours")
      .eq("role", "employee"),
    supabase.from("sessions").select("id, employee_id, time_in, time_out"),
    supabase
      .from("outputs")
      .select("id, employee_id, date, title, attachment_type, attachment_url, status, reviewer_notes"),
  ]);

  const employees = (profiles ?? []) as Profile[];
  const allSessions = (sessions ?? []) as Session[];
  const allOutputs = (outputs ?? []) as Output[];

  const todaysSessionsByEmployee = new Map<string, Session[]>();
  for (const s of allSessions) {
    if (toDateKey(s.time_in) !== today) continue;
    const arr = todaysSessionsByEmployee.get(s.employee_id) ?? [];
    arr.push(s);
    todaysSessionsByEmployee.set(s.employee_id, arr);
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
      status: getDayStatus(eSessions, eOutputs),
      hours: totalHours(eSessions),
    };
  });

  const presentCount = rows.filter((r) => r.status === "present").length;
  const absentCount = rows.filter((r) => r.status === "absent").length;
  const needsAttention = rows.filter(
    (r) => r.status === "unverified" || r.status === "incomplete"
  );
  const pendingReviewCount = allOutputs.filter((o) => o.status !== "done").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Admin dashboard"
        description="Monitor attendance, employees, and outputs across your team."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
        <StatCard
          label="Present today"
          value={presentCount}
          icon={UserCheck}
          tone="success"
          trend={`of ${employees.length} employees`}
          delay={0}
        />
        <StatCard
          label="Absent today"
          value={absentCount}
          icon={UserX}
          tone={absentCount > 0 ? "danger" : "default"}
          delay={60}
        />
        <StatCard
          label="Needs attention"
          value={needsAttention.length}
          icon={AlertTriangle}
          tone={needsAttention.length > 0 ? "warning" : "default"}
          trend="Missing time-out or output"
          delay={120}
        />
        <StatCard
          label="Outputs to review"
          value={pendingReviewCount}
          icon={FileClock}
          delay={180}
        />
      </div>

      <div className="elev-2 animate-fade-up rounded-card p-6" style={{ animationDelay: "220ms" }}>
        <h2 className="text-[16px] font-bold text-ink">Needs attention</h2>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          Clocked in today but missing a time-out or an output.
        </p>

        {needsAttention.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Nothing to flag"
            description="Everyone who clocked in today has submitted their output."
          />
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {needsAttention.map(({ profile, status, hours }) => (
              <li
                key={profile.id}
                className="flex items-center justify-between rounded-md px-2 py-3 transition-colors hover:bg-accent-soft/40"
              >
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{profile.full_name}</p>
                  <p className="text-[12.5px] text-ink-muted">
                    {profile.position || "—"} · {formatHours(hours)} logged today
                  </p>
                </div>
                <DayStatusPill status={status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
