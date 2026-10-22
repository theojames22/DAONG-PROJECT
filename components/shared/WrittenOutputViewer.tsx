"use client";

import { useId } from "react";
import { FileText, X } from "lucide-react";
import ModalShell from "./ModalShell";

export interface WrittenOutputViewerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  submitter?: string | null;
  date?: string | null;
  /** A status pill supplied by the caller (Head or Staff vocabulary). */
  statusSlot?: React.ReactNode;
  /** Optional note shown under the body (e.g. reviewer feedback). */
  notes?: string | null;
  notesLabel?: string;
}

/**
 * Formats a stored timestamp, or a bare YYYY-MM-DD date key.
 * A bare key is parsed as LOCAL midnight so the calendar day shown matches
 * the day the submission belongs to (matching lib/attendance.ts).
 */
function formatSubmittedAt(value: string | null | undefined): string {
  if (!value) return "";
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/**
 * Read-only viewer for a Written Output.
 *
 * The body is rendered as TEXT inside a `whitespace-pre-wrap` block — no
 * `dangerouslySetInnerHTML`, no markdown-to-HTML, no sanitizer to get
 * wrong. Whatever the author typed is exactly what the reviewer sees, and
 * anything resembling a tag stays a literal string.
 */
export default function WrittenOutputViewer({
  open,
  onClose,
  title,
  content,
  submitter,
  date,
  statusSlot,
  notes,
  notesLabel = "Note",
}: WrittenOutputViewerProps) {
  const titleId = useId();
  const body = (content || "").replace(/\r\n?/g, "\n");

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      ariaLabelledBy={titleId}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/90 px-5 py-4 sm:px-6 dark:border-slate-700/80">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
            <h2
              id={titleId}
              className="min-w-0 break-words text-[15px] font-bold text-slate-900 sm:text-base dark:text-slate-100"
            >
              {title || "Written output"}
            </h2>
            {statusSlot}
          </div>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
            {submitter ? `Submitted by ${submitter}` : "Written output"}
            {date ? ` · ${formatSubmittedAt(date)}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close written output"
          className="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — scrolls, wraps, and preserves the author's line breaks. */}
      <div
        tabIndex={0}
        className="max-h-[60vh] overflow-y-auto overscroll-contain px-5 py-5 outline-none sm:px-6 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30"
      >
        {body.trim() ? (
          <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-slate-800 dark:text-slate-200">
            {body}
          </div>
        ) : (
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            This submission has no written content.
          </p>
        )}

        {notes?.trim() ? (
          <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-3 dark:border-slate-700/70 dark:bg-slate-900/40">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {notesLabel}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300">
              {notes}
            </p>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200/90 px-5 py-3 sm:px-6 dark:border-slate-700/80">
        <span className="text-[11px] font-medium text-slate-400">
          Plain text · line breaks preserved
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}
