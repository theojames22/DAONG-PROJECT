import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import EquipmentUsageLog from "@/components/head/equipment/EquipmentUsageLog";

/**
 * Equipment usage log — Head accounts only.
 * The page shell (auth + role gate) is server-rendered;
 * the log itself is a client component so the filters,
 * modal and toasts stay interactive.
 */
export default async function EquipmentPage() {
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

  // Head (administrator) accounts only. Staff are sent to their own
  // dashboard.
  if (profile.role !== USER_ROLES.HEAD) {
    redirect("/employee");
  }

  const supabase = await createClient();
  const { data: fullProfile } = await supabase
    .from("profiles")
    .select("full_name, position, email, profile_picture_url, theme_preference")
    .eq("id", user.id)
    .single();

  return (
    <EquipmentUsageLog
      admin={{
        id: user.id,
        full_name: fullProfile?.full_name ?? profile.full_name ?? null,
        email: fullProfile?.email ?? profile.email ?? null,
        position: fullProfile?.position ?? profile.position ?? null,
        profile_picture_url: fullProfile?.profile_picture_url ?? profile.profile_picture_url ?? null,
        theme_preference: fullProfile?.theme_preference ?? profile.theme_preference ?? null,
      }}
    />
  );
}
