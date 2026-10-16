import { redirect } from "next/navigation";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import ScheduleManagement from "@/components/head/schedule/ScheduleManagement";
import { createClient } from "@/lib/supabase/server";

/**
 * Schedule Management — Head accounts only (matching the equipment
 * log's gating).
 *
 * The shell (auth + role gate) is server-rendered; the calendar is a
 * client component so month navigation, filtering, the list view and
 * the live updates stay interactive.
 */
export default async function HeadSchedulePage() {
  let profile;
  let viewerId = "";
  try {
    const { profile: p, user } = await getAuthenticatedProfile();
    profile = p;
    viewerId = user.id;
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
  const { data: fullProfile } = await supabase
    .from("profiles")
    .select("full_name, position, email, profile_picture_url, theme_preference")
    .eq("id", viewerId)
    .single();

  return (
    <ScheduleManagement
      admin={{
        id: viewerId,
        full_name: fullProfile?.full_name ?? profile.full_name ?? null,
        email: fullProfile?.email ?? profile.email ?? null,
        position: fullProfile?.position ?? profile.position ?? null,
        profile_picture_url:
          fullProfile?.profile_picture_url ?? profile.profile_picture_url ?? null,
        theme_preference:
          fullProfile?.theme_preference ?? profile.theme_preference ?? null,
      }}
    />
  );
}
