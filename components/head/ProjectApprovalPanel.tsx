"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Loader2, MessageSquare, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  AttachmentType,
  Notification,
  Project,
  ProjectStatus,
} from "@/lib/types";
import SubmissionAction from "@/components/shared/SubmissionAction";
import { formatFileSize } from "@/lib/outputs";
import { ProjectStatusPill } from "./ProjectList";

interface ProjectApprovalPanelProps {
  project: Project;
  adminId: string;
  initialMessages: Notification[];
}

/** Written bodies are shown in full in the viewer; this is the inline taster. */
const EXCERPT_LIMIT = 420;

export default function ProjectApprovalPanel({
  project,
  adminId,
  initialMessages,
}: ProjectApprovalPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [notes, setNotes] = useState(() => {
    const existing = (project.reviewer_notes ?? "").trim();
    const submitted = (project.description ?? "").trim();
    // Legacy rows had the staff note copied into reviewer_notes by the old
    // backfill. Showing that back as the Head's own feedback would be a lie,
    // so identical values are treated as "no reviewer note yet".
    return existing && existing !== submitted ? project.reviewer_notes ?? "" : "";
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [messages, setMessages] = useState<Notification[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // Follow the database: if the stored status changes — another admin's
  // decision, or the refresh after our own save — the pill and buttons
  // reflect it instead of showing a stale decision.
  useEffect(() => {
    setStatus(project.status);
  }, [project.status]);

  const submission = project.submission ?? null;
  const writtenContent = (submission?.content ?? "").trim();

  /**
   * The submission type, with a fallback for rows that predate the column
   * join (or a database where the migration hasn't run yet).
   */
  const artifactType: AttachmentType | null =
    submission?.attachment_type ??
    (project.file_url
      ? /\.(png|jpe?g|gif|webp|svg)$/i.test(project.file_url)
        ? "image"
        : "file"
      : null);

  const isImage = artifactType === "image";
  const actionLabel =
    artifactType === "written"
      ? "Read submission"
      : artifactType === "link"
        ? "Open link"
        : artifactType === "image"
          ? "Open image"
          : "Download file";

  const decisionLocked = status === "approved" || status === "rejected";

  async function reviewProject(next: ProjectStatus) {
    // Guard against conflicting / duplicate updates. The buttons are also
    // disabled in these states, but never fire an action regardless.
    if (saving || next === status) return;

    // A final decision cannot be flipped straight to the other one — the
    // database enforces this too (guard_final_decision). Reopening to
    // "checking" is the authorized correction path.
    if (decisionLocked && (next === "approved" || next === "rejected")) {
      setFeedback('Reopen this submission to "Checking" before changing a final decision.');
      return;
    }

    setSaving(true);
    setFeedback(null);
    const { error } = await supabase
      .from("projects")
      .update({
        status: next,
        reviewed_by: adminId,
        reviewer_notes: notes.trim() || null,
      })
      .eq("id", project.id);

    // Only mirror the change onto the linked output when the decision itself
    // was accepted. If the update was rejected (for example by the
    // final-decision guard), the output must stay exactly as it was.
    if (!error && project.source_output_id) {
      const outputStatus =
        next === "approved"
          ? "done"
          : next === "rejected"
          ? "rejected"
          : next === "checking"
          ? "checking"
          : "pending";

      // The DB trigger (sync_output_from_project) already did this; writing
      // the same values is idempotent and keeps the two tables in step if
      // the trigger is unavailable.
      await supabase
        .from("outputs")
        .update({
          status: outputStatus,
          reviewed_by: adminId,
          reviewer_notes: notes.trim() || null,
        })
        .eq("id", project.source_output_id);
    }

    setSaving(false);
    if (error) {
      setFeedback(error.message);
      return;
    }
    setStatus(next);
    setFeedback(
      next === "approved"
        ? "Project approved."
        : next === "rejected"
          ? "Project rejected."
          : "Marked as checking."
    );
    router.refresh();
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase.from("notifications").insert({
      sender_id: adminId,
      receiver_id: project.submitted_by,
      message: text,
      project_id: project.id,
    });
    setSending(false);
    if (error) {
      setFeedback(error.message);
      return;
    }
    setReply("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ===== Decision card ===== */}
      <div className="neu-raised rounded-neu p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[17px] font-bold text-ink">
                {project.title}
              </h2>
              <ProjectStatusPill status={status} />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              Submitted by {project.submitter?.full_name || "Unknown"}
              {project.submitter?.position ? ` · ${project.submitter.position}` : ""} on{" "}
              {new Date(project.created_at).toLocaleString()}
            </p>
            {submission?.file_size ? (
              <p className="mt-0.5 text-[11px] text-ink-subtle">
                {submission.file_name || "Attachment"}
                {submission.file_mime_type ? ` · ${submission.file_mime_type}` : ""}
                {` · ${formatFileSize(submission.file_size)}`}
              </p>
            ) : null}
          </div>

          <SubmissionAction
            type={artifactType}
            title={project.title}
            url={project.file_url}
            content={writtenContent}
            projectId={project.id}
            fileName={submission?.file_name ?? null}
            submitter={project.submitter?.full_name ?? null}
            date={project.created_at}
            statusSlot={<ProjectStatusPill status={status} />}
            label={actionLabel}
            className="btn-secondary neu-focus shrink-0"
          />
        </div>

        {project.description && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              Notes from the submitter
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-muted">
              {project.description}
            </p>
          </div>
        )}

        {/* Written output — inline excerpt, full text in the viewer. */}
        {artifactType === "written" && (
          <div className="mt-4 rounded-xl border border-border bg-base-light/50 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              Written output
            </p>
            {writtenContent ? (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
                {writtenContent.length > EXCERPT_LIMIT
                  ? `${writtenContent.slice(0, EXCERPT_LIMIT).trimEnd()}…`
                  : writtenContent}
              </p>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-ink-subtle">
                This submission has no written content.
              </p>
            )}
          </div>
        )}

        {isImage && (project.source_output_id || project.file_url) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/projects/${encodeURIComponent(project.id)}/file`}
            alt={project.title}
            className="mt-4 max-h-72 w-auto rounded-lg border border-border object-contain"
          />
        )}

        {/* Reviewer notes + decision buttons */}
        <div className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
              Reviewer notes (sent with the decision)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional feedback for the employee…"
              className="elev-pressed neu-focus resize-none rounded-xl p-3 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {/* Checking is always available — it is the documented way to
                reopen a finished review. Approve/Reject lock once a final
                decision exists; the database enforces the same rule. */}
            <button
              type="button"
              onClick={() => reviewProject("checking")}
              disabled={saving || status === "checking"}
              className="btn-secondary btn-decision neu-focus"
              title={
                decisionLocked
                  ? "Reopen this submission for another review"
                  : status === "checking"
                    ? "Already marked as checking"
                    : undefined
              }
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clock3 className="h-3.5 w-3.5" />
              )}
              Checking
            </button>
            <button
              type="button"
              onClick={() => reviewProject("approved")}
              disabled={saving || decisionLocked}
              className="btn-primary btn-decision neu-focus"
              title={
                status === "approved"
                  ? "Approve is disabled — this submission is already approved"
                  : status === "rejected"
                    ? "Reopen to Checking before approving a rejected submission"
                    : undefined
              }
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Approve
            </button>
            <button
              type="button"
              onClick={() => reviewProject("rejected")}
              disabled={saving || decisionLocked}
              className="btn-danger btn-decision neu-focus"
              title={
                status === "rejected"
                  ? "Reject is disabled — this submission is already rejected"
                  : status === "approved"
                    ? "Reopen to Checking before rejecting an approved submission"
                    : undefined
              }
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Reject
            </button>
            {feedback && (
              <p className="text-[12px] font-semibold text-ink-muted">{feedback}</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== Thread with the employee ===== */}
      <div className="neu-raised rounded-neu p-5">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-accent" />
          <h3 className="text-[13.5px] font-bold text-ink">
            Discussion with {project.submitter?.full_name || "employee"}
          </h3>
        </div>

        {messages.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-muted">
            No messages yet. Send the first note about this project.
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.sender_id === adminId;
              return (
                <li
                  key={m.id}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed ${
                      mine
                        ? "bg-blue-600 text-white"
                        : "elev-pressed text-ink"
                    }`}
                  >
                    <p className={`mb-0.5 text-[10.5px] font-semibold ${mine ? "text-blue-100" : "text-ink-subtle"}`}>
                      {mine ? "You" : m.sender?.full_name || "Employee"}
                    </p>
                    {m.message}
                  </div>
                  <span className="mt-0.5 text-[10.5px] text-ink-subtle">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendReply();
            }}
            placeholder="Write a message to the staff…"
            className="elev-pressed neu-focus min-w-0 flex-1 rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
          />
          <button
            type="button"
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            aria-label="Send message"
            className="btn-primary neu-focus px-4"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
