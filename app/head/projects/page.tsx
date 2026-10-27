import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Project } from "@/lib/types";
import ProjectsHeader from "@/components/head/ProjectsHeader";
import ProjectList from "@/components/head/ProjectList";

export default async function ProjectsPage() {
  let profile;
  let viewerId = "";
  try {
    const { profile: p, user: u } = await getAuthenticatedProfile();
    profile = p;
    viewerId = u.id;
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

  const { data: projects } = await supabase
    .from("projects")
    .select(
      "id, title, description, file_url, status, submitted_by, reviewed_by, reviewer_notes, created_at, updated_at, submitter:profiles!projects_submitted_by_fkey(full_name, position)"
    )
    .order("created_at", { ascending: false });

  const items = (projects ?? []) as unknown as Project[];

  const pendingCount = items.filter((p) => p.status === "pending").length;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <ProjectsHeader
        pendingCount={pendingCount}
        adminId={viewerId}
        adminName={profile.full_name || "Head"}
        adminEmail={profile.email ?? null}
        adminAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={profile.theme_preference ?? "light"}
        adminPosition={profile.position ?? null}
      />

      <ProjectList projects={items} />
    </div>
  );
}
