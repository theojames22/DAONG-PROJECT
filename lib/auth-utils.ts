import { createClient } from "@/lib/supabase/server";
import { USER_ROLES, UserRole } from "@/lib/constants";

export class ProfileMissingError extends Error {
  constructor() {
    super("User profile not found.");
    this.name = "ProfileMissingError";
  }
}

export async function getAuthenticatedProfile() {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new ProfileMissingError();
  }

  return {
    user,
    profile: profile as {
      full_name: string;
      role: UserRole;
      position?: string;
      required_weekly_hours: number;
    },
  };
}
