import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { getWeekRange, toDateKey } from "@/lib/attendance";
import { Session, Output } from "@/lib/types";
import StaffDashboard from "@/components/employee/StaffDashboard";

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

  const supabase = await createClient();
  const now = new Date();
  const { start, end } = getWeekRange(now);
  const today = toDateKey(now.toISOString());

  const [{ data: weekSessions }, { data: todaySessions }, { data: outputs }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, employee_id, time_in, time_out")
        .eq("employee_id", user.id)
        .gte("time_in", `${start}T00:00:00`)
        .lte("time_in", `${end}T23:59:59`)
        .order("time_in", { ascending: true }),

      supabase
        .from("sessions")
        .select("id, employee_id, time_in, time_out")
        .eq("employee_id", user.id)
        .gte("time_in", `${today}T00:00:00`)
        .lte("time_in", `${today}T23:59:59`)
        .order("time_in", { ascending: true }),

      supabase
        .from("outputs")
        .select("*")
        .eq("employee_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  return (
    <StaffDashboard
      profile={{
        id: user.id,
        full_name: profile.full_name,
        position: profile.position ?? null,
        role: profile.role,
        required_weekly_hours: profile.required_weekly_hours,
        profile_picture_url: profile.profile_picture_url ?? null,
        email: profile.email ?? user.email ?? null,
        theme_preference: profile.theme_preference ?? "light",
      }}
      initialWeekSessions={(weekSessions ?? []) as Session[]}
      initialTodaySessions={(todaySessions ?? []) as Session[]}
      initialOutputs={(outputs ?? []) as Output[]}
    />
  );
}
