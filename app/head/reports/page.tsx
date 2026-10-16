import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import ReportsClient from "@/components/head/reports/ReportsClient";
import { Lock } from "lucide-react";

/**
 * Reports — Head accounts only.
 * Staff cannot use the page: direct navigation shows the locked
 * panel with the exact message instead of a dead redirect, and every
 * report endpoint refuses them server-side.
 */
export default async function ReportsPage() {
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
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[22px] border border-[#D5E0F5] bg-white px-8 py-10 text-center shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2F8] text-[#44506A]">
            <Lock className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-[20px] font-extrabold tracking-tight text-[#0F1B33]">
            Reports
          </h1>
          <p className="mt-2 text-[14px] font-medium text-[#5F6A80]">
            Reports are for Head accounts
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: fullProfile } = await supabase
    .from("profiles")
    .select("full_name, position, email, profile_picture_url, theme_preference")
    .eq("id", viewerId)
    .single();

  return (
    <ReportsClient
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
