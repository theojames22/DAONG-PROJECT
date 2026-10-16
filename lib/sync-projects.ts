import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures all deliverables stored in `outputs` are mirrored into `projects`
 * so the Head project review queue is never empty when submissions exist.
 */
export async function syncOutputsToProjects(supabase: SupabaseClient) {
  try {
    const [{ data: outputs }, { data: existingProjects }] = await Promise.all([
      supabase
        .from("outputs")
        .select("id, employee_id, date, title, attachment_url, status, reviewer_notes, reviewed_by, created_at"),
      supabase
        .from("projects")
        .select("id, source_output_id"),
    ]);

    if (!outputs || outputs.length === 0) return;

    const existingSourceIds = new Set(
      (existingProjects ?? []).map((p) => p.source_output_id).filter(Boolean)
    );

    const missing = outputs.filter((o) => !existingSourceIds.has(o.id));
    if (missing.length === 0) return;

    for (const o of missing) {
      const projectStatus =
        o.status === "done"
          ? "approved"
          : o.status === "rejected"
          ? "rejected"
          : o.status === "checking"
          ? "checking"
          : "pending";

      await supabase.from("projects").insert({
        title: o.title?.trim() || `Output ${o.date}`,
        description: o.reviewer_notes,
        file_url: o.attachment_url,
        status: projectStatus,
        submitted_by: o.employee_id,
        reviewed_by: o.reviewed_by,
        source_output_id: o.id,
        created_at: o.created_at || new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Failed to sync outputs to projects:", err);
  }
}
