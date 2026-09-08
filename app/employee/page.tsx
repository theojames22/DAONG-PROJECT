import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { getWeekRange, totalHours, formatHours } from "@/lib/attendance";
import { Session } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import TimeClock from "@/components/employee/TimeClock";

export default async function EmployeePage() {
  let profile;
  let user;
  try {
    const result = await getAuthenticatedProfile();
    profile = result.profile;
    user = result.user;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  if (profile.role !== USER_ROLES.EMPLOYEE) {
    redirect("/admin");
  }

  const supabase = createClient();
  const { start, end } = getWeekRange(new Date());

  const { data: weekSessions } = await supabase
    .from("sessions")
    .select("id, employee_id, time_in, time_out")
    .eq("employee_id", user.id)
    .gte("time_in", `${start}T00:00:00`)
    .lte("time_in", `${end}T23:59:59`);

  const hoursThisWeek = totalHours((weekSessions ?? []) as Session[]);
  const required = profile.required_weekly_hours;
  const remaining = Math.max(required - hoursThisWeek, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-4 sm:p-8">
      <PageHeader
        title={`Welcome back, ${profile.full_name?.split(" ")[0] || "there"}`}
        description={profile.position || "Track your time and submit your work here."}
      />

      <TimeClock employeeId={user.id} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="This week"
          value={formatHours(hoursThisWeek)}
          icon={CalendarCheck}
          tone={hoursThisWeek >= required ? "success" : "default"}
          trend={
            remaining > 0
              ? `${formatHours(remaining)} left to hit ${formatHours(required)}`
              : "Weekly target met"
          }
          delay={0}
        />
        <StatCard
          label="Weekly target"
          value={formatHours(required)}
          icon={CalendarCheck}
          delay={60}
        />
      </div>
    </div>
  );
}
