import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Notification, Project, ProjectSubmission } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import ProjectApprovalPanel from "@/components/head/ProjectApprovalPanel";

const PROJECT_COLUMNS =
  "id, title, description, file_url, status, submitted_by, reviewed_by, reviewer_notes, created_at, updated_at, source_output_id, submitter:profiles!projects_submitted_by_fkey(full_name, position)";

/** The linked submission, read separately so no relationship-name hint is needed. */
const SUBMISSION_COLUMNS =
  "attachment_type, content, submission_notes, file_name, storage_path, file_mime_type, file_size";

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

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      params.id
    )
  ) {
    notFound();
  }

  const supabase = await createClient();

  // The project is mirrored from its output by a database trigger. If it is
  // missing, show 404 rather than running a full-table reconciliation with
  // inserts that RLS correctly rejects for Staff.
  const { data: project } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .or(`id.eq.${params.id},source_output_id.eq.${params.id}`)
    .maybeSingle();

  if (!project) notFound();

  // The written body / attachment metadata lives on the outputs row. Read it
  // by id — RLS lets a Head read every output — instead of relying on a
  // PostgREST relationship hint for the mirrored row.
  let submission: ProjectSubmission | null = null;
  if (project.source_output_id) {
    const { data: output } = await supabase
      .from("outputs")
      .select(SUBMISSION_COLUMNS)
      .eq("id", project.source_output_id)
      .maybeSingle();
    submission = (output as unknown as ProjectSubmission | null) ?? null;
  }

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
        project={{ ...(project as unknown as Project), submission }}
        adminId={user.id}
        initialMessages={(messages ?? []) as unknown as Notification[]}
      />
    </div>
  );
}
