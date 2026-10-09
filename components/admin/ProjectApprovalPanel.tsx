"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  Loader2,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Notification, Project, ProjectStatus } from "@/lib/types";
import { ProjectStatusPill } from "./ProjectList";

interface ProjectApprovalPanelProps {
  project: Project;
  adminId: string;
  initialMessages: Notification[];
}

export default function ProjectApprovalPanel({
  project,
  adminId,
  initialMessages,
}: ProjectApprovalPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [notes, setNotes] = useState(project.reviewer_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [messages, setMessages] = useState<Notification[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(project.file_url);

  async function reviewProject(next: ProjectStatus) {
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

    setSaving(false);
    if (error) {
      setFeedback(error.message);
      return;
    }
    setStatus(next);
    setFeedback(next === "approved" ? "Project approved." : "Project rejected.");
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
          </div>

          <a
            href={project.file_url}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary neu-focus shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open file
          </a>
        </div>

        {project.description && (
          <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
            {project.description}
          </p>
        )}

        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.file_url}
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
            <button
              type="button"
              onClick={() => reviewProject("approved")}
              disabled={saving}
              className="btn-primary neu-focus"
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
              disabled={saving}
              className="btn-danger neu-focus"
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
