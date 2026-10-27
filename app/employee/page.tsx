import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import {
  dateKeyIn,
  dayEndISO,
  dayStartISO,
  weekRangeIn,
} from "@/lib/time";
import { getAppTimezone } from "@/lib/report/queries";
import { Session } from "@/lib/types";
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

  if (profile.role !== USER_ROLES.STAFF) {
    redirect("/head");
  }

  const supabase = await createClient();
  const timezone = await getAppTimezone(supabase);
  const { start, end } = weekRangeIn(timezone);
  const today = dateKeyIn(timezone);

  const [{ data: weekSessions }, { data: todaySessions }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .eq("employee_id", user.id)
      .gte("time_in", dayStartISO(start, timezone))
      .lte("time_in", dayEndISO(end, timezone))
      .order("time_in", { ascending: true }),

    supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .eq("employee_id", user.id)
      .gte("time_in", dayStartISO(today, timezone))
      .lte("time_in", dayEndISO(today, timezone))
      .order("time_in", { ascending: true }),
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
    />
  );
}
