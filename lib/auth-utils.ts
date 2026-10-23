import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/constants";
import type { ThemePreference } from "@/lib/types";

export class ProfileMissingError extends Error {
  constructor() {
    super("User profile not found.");
    this.name = "ProfileMissingError";
  }
}

export type AuthenticatedProfile = {
  id: string;
  full_name: string;
  role: UserRole;
  position?: string | null;
  required_weekly_hours: number;
  profile_picture_url?: string | null;
  email?: string | null;
  theme_preference?: ThemePreference;
};

/**
 * Resolves the signed-in user and their profile row.
 *
 * `getClaims()` verifies the access token locally against the project's JWKS
 * (the project signs with ES256) instead of calling `/auth/v1/user` on every
 * request. It still refreshes an expiring session through `getSession()`, so
 * the middleware's cookie-rotation behaviour is unchanged — but the round trip
 * is gone from the critical path.
 *
 * The function is wrapped in React `cache()` so the root layout, the section
 * layout and the page share one verification and one `profiles` query per
 * render instead of repeating them three times.
 *
 * Authorization still comes from `profiles.role` (never from token metadata),
 * so a role change takes effect on the next request exactly as before.
 */
export const getAuthenticatedProfile = cache(async () => {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .single();

  if (profileError || !profile) {
    throw new ProfileMissingError();
  }

  return {
    user: {
      id: claims.sub as string,
      email: (claims.email as string | undefined) ?? null,
    },
    profile: profile as AuthenticatedProfile,
  };
});
