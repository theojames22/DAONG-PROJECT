import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Notification, Project } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import ProjectApprovalPanel from "@/components/admin/ProjectApprovalPanel";

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

  if (profile.role !== USER_ROLES.ADMIN) {
    redirect("/employee");
  }

  const supabase = await createClient();

  // The project (with its submitter) and the admin↔employee thread about it.
  const [{ data: project }, { data: messages }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, description, file_url, status, submitted_by, reviewed_by, reviewer_notes, created_at, updated_at, submitter:profiles!projects_submitted_by_fkey(full_name, position)"
      )
      .eq("id", params.id)
      .single(),
    supabase
      .from("notifications")
      .select(
        "id, sender_id, receiver_id, message, project_id, is_read, created_at, sender:profiles!notifications_sender_id_fkey(full_name)"
      )
      .eq("project_id", params.id)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: true }),
  ]);

  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
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
