import { redirect } from "next/navigation";
import {
  getAuthenticatedProfile,
  ProfileMissingError,
} from "@/lib/auth-utils";
import Sidebar from "@/components/head/Sidebar";
import HeadTopBar from "@/components/head/HeadTopBar";
import type { Theme } from "@/components/theme/ThemeProvider";
import { USER_ROLES } from "@/lib/constants";

/**
 * Head layout — the administrator dashboard shell. Heads are the system
 * administrators: they manage the team, attendance, reports, schedules,
 * equipment and output approvals. They do not clock in/out.
 */
export default async function HeadLayout({
  children,
}: {
  children: React.ReactNode;
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

  // Only Heads may open the head dashboard; Staff go to the employee
  // dashboard.
  if (profile.role !== USER_ROLES.HEAD) {
    if (profile.role === USER_ROLES.STAFF) redirect("/employee");
    redirect("/login");
  }

  const headName = profile.full_name || user.email || "Head";

  return (
    <div
      className="min-h-screen"
      data-dashboard
      style={{
        backgroundImage:
          "linear-gradient(var(--bg-overlay), var(--bg-overlay)), url('/images/dashboardbg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <HeadTopBar
        headId={profile.id}
        headName={headName}
        headEmail={profile.email ?? user.email ?? null}
        headAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={(profile.theme_preference as Theme) ?? "light"}
        headPosition={profile.position ?? null}
      />
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col gap-6 p-4 pt-6 sm:p-6 sm:pt-8 lg:px-8 lg:pb-8">
        <Sidebar
          headName={headName}
          headPosition={profile.position ?? null}
          headAvatarUrl={profile.profile_picture_url ?? null}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
