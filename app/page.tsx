import { redirect } from "next/navigation";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";

export default async function Home() {
  try {
    const { profile } = await getAuthenticatedProfile();

    if (profile.role === USER_ROLES.ADMIN) {
      redirect("/admin");
    }

    redirect("/employee");
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }
}
