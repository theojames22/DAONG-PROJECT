import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Project } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import ProjectList from "@/components/admin/ProjectList";

export default async function ProjectsPage() {
  let profile;
  try {
    const { profile: p } = await getAuthenticatedProfile();
    profile = p;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  if (profile.role !== USER_ROLES.ADMIN) {
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Project submissions"
        description="Approve or reject staff project uploads. Selecting a project opens its approval page."
      />

      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 font-semibold text-warning">
          {pendingCount} awaiting review
        </span>
      </div>

      <ProjectList projects={items} />
    </div>
  );
}
