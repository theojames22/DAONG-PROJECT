import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { buildWeeklyCompliance } from "@/lib/compliance/server";
import WeeklyCompliance from "@/components/head/compliance/WeeklyCompliance";

/**
 * Weekly Compliance (Head only).
 *
 * The first paint is server-rendered from real rows. Week changes and live
 * refreshes go through /api/head/compliance, which uses the same builder, so
 * the page can keep its search/filter state and animate values in place.
 */
export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { week?: string | string[] };
}) {
  let profile;
  let user;
  try {
    const auth = await getAuthenticatedProfile();
    profile = auth.profile;
    user = auth.user;
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
  const requestedWeek = Array.isArray(searchParams.week)
    ? searchParams.week[0]
    : searchParams.week;
  const initial = await buildWeeklyCompliance(supabase, {
    week: requestedWeek ?? null,
  });

  return (
    <WeeklyCompliance
      initial={initial}
      head={{
        id: profile.id,
        name: profile.full_name || user.email || "Head",
        email: profile.email ?? user.email ?? null,
        avatarUrl: profile.profile_picture_url ?? null,
        position: profile.position ?? null,
        theme: profile.theme_preference ?? "light",
      }}
    />
  );
}
