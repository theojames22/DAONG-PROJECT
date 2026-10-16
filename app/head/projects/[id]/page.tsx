import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Notification, Project } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import ProjectApprovalPanel from "@/components/head/ProjectApprovalPanel";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
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

  if (profile.role !== USER_ROLES.HEAD) {
    redirect("/employee");
  }

  const supabase = await createClient();

  // Try finding by project ID or source output ID
  let { data: project } = await supabase
    .from("projects")
    .select(
      "id, title, description, file_url, status, submitted_by, reviewed_by, reviewer_notes, created_at, updated_at, submitter:profiles!projects_submitted_by_fkey(full_name, position)"
    )
    .or(`id.eq.${params.id},source_output_id.eq.${params.id}`)
    .maybeSingle();

  if (!project) {
    const { syncOutputsToProjects } = await import("@/lib/sync-projects");
    await syncOutputsToProjects(supabase);

    const { data: syncedProject } = await supabase
      .from("projects")
      .select(
        "id, title, description, file_url, status, submitted_by, reviewed_by, reviewer_notes, created_at, updated_at, submitter:profiles!projects_submitted_by_fkey(full_name, position)"
      )
      .or(`id.eq.${params.id},source_output_id.eq.${params.id}`)
      .maybeSingle();
    project = syncedProject;
  }

  if (!project) notFound();

  const { data: messages } = await supabase
    .from("notifications")
    .select(
      "id, sender_id, receiver_id, message, project_id, is_read, created_at, sender:profiles!notifications_sender_id_fkey(full_name)"
    )
    .eq("project_id", project.id)
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      {/* Back to the projects list — the detail page is reached from the
          list, notification deep-links, and file previews, so a fixed
          destination beats relying on browser history. */}
      <Link
        href="/head/projects"
        className="neu-icon-btn neu-focus inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-dark transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
        Back to projects
      </Link>
      <PageHeader
        title="Project approval"
        description="Review the submission, approve or reject it, and message the employee."
      />
      <ProjectApprovalPanel
        project={project as unknown as Project}
        adminId={user.id}
        initialMessages={(messages ?? []) as unknown as Notification[]}
      />
    </div>
  );
}
