import { redirect } from "next/navigation";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import type { AuthenticatedProfile } from "@/lib/auth-utils";

export default async function Home() {
  let profile: AuthenticatedProfile;
  try {
    const auth = await getAuthenticatedProfile();
    profile = auth.profile;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  // Keep redirects outside the try: redirect() throws NEXT_REDIRECT, and a
  // surrounding catch would otherwise swallow it and send every signed-in
  // user back to /login.
  if (profile.role === USER_ROLES.HEAD) {
    redirect("/head");
  }

  redirect("/employee");
}
