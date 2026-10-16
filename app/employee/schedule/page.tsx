import { redirect } from "next/navigation";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import MyScheduleView from "@/components/employee/MyScheduleView";

export const metadata = {
  title: "My Schedule — Daong",
  description: "Manage your availability and let the team know when you're available.",
};

export default async function EmployeeSchedulePage() {
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

  return (
    <MyScheduleView
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
    />
  );
}
