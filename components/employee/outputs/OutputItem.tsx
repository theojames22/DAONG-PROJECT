"use client";

import { useState, type CSSProperties } from "react";
import {
  AlertCircle,
  ArrowRight,
  Download,
  ExternalLink,
  Maximize2,
} from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import { safeFileName } from "@/lib/file-name";
import type { Output } from "@/lib/types";
import OutputMediaPreview from "./OutputMediaPreview";
import ReviewTimeline from "./ReviewTimeline";
import StatusBadge from "./StatusBadge";
import {
  STATUS_META,
  TYPE_META,
  attachmentUrl,
  downloadUrl,
  formatDateTime,
  formatSubmittedStamp,
  hasFeedback,
  submissionSubtitle,
  type PreviewState,
  type ViewMode,
} from "./my-outputs-ui";

export interface OutputItemProps {
  output: Output;
  view: ViewMode;
  /** Written body preview — only ever fetched for the visible page. */
  preview?: string | null;
  previewState: PreviewState;
  onOpen: (output: Output) => void;
  onOpenImage: (image: { url: string; name: string }) => void;
  /** Staggered entrance, in milliseconds. */
  delayMs?: number;
}

function titleOf(output: Output): string {
  return output.title?.trim() || "Untitled output";
}

function reviewNote(output: Output): string {
  if (output.status === "pending") return "Waiting for review";
  const when = formatDateTime(output.reviewed_at);
  if (output.status === "checking") {
    return when ? `Review started ${when}` : "In review";
  }
  return when ? `Reviewed ${when}` : "Reviewed";
}

function feedbackTitle(output: Output): string {
  return output.status === "rejected" ? "Reason for rejection" : "Feedback available";
}

function ListThumb({ output }: { output: Output }) {
  const [failed, setFailed] = useState(false);
  const type = TYPE_META[output.attachment_type] ?? TYPE_META.file;
  const TypeIcon = type.icon;
  const url = attachmentUrl(output);
  const isImage = output.attachment_type === "image";

  if (isImage && url && !failed) {
    return (
      <span
        className={styles.listThumb}
        style={{ background: "var(--mo-soft)" }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={styles.listThumb}
      style={{ background: type.thumbBg, color: type.thumbFg }}
      aria-hidden="true"
    >
      <TypeIcon className="h-[22px] w-[22px]" strokeWidth={2} />
    </span>
  );
}

/**
 * One submission, as a grid card or a compact list row.
 *
 * Interactive controls are real buttons/links instead of a full-card overlay,
 * so details, download, link and zoom actions stay reachable by mouse and
 * keyboard.
 */
export default function OutputItem({
  output,
  view,
  preview,
  previewState,
  onOpen,
  onOpenImage,
  delayMs = 0,
}: OutputItemProps) {
  const type = TYPE_META[output.attachment_type] ?? TYPE_META.file;
  const status = STATUS_META[output.status] ?? STATUS_META.pending;
  const title = titleOf(output);
  const url = attachmentUrl(output);
  const feedback = hasFeedback(output);
  const submittedLabel = formatSubmittedStamp(output);
  const statusLabel = output.status === "done" ? "approved" : status.label.toLowerCase();
  const delay = `${delayMs}ms`;
  const feedbackTone =
    output.status === "rejected"
      ? {
          background: "var(--mo-danger-soft)",
          border: "var(--mo-danger-line)",
          ink: "var(--mo-danger-ink)",
          dot: "var(--mo-danger)",
        }
      : output.status === "checking"
        ? {
            background: "var(--mo-blue-soft)",
            border: "var(--mo-blue-line)",
            ink: "var(--mo-blue-ink)",
            dot: "var(--mo-blue)",
          }
        : {
            background: "var(--mo-success-soft)",
            border: "var(--mo-success-line)",
            ink: "var(--mo-success-ink)",
            dot: "var(--mo-success)",
          };

  if (view === "list") {
    const missingAttachment =
      (output.attachment_type === "file" || output.attachment_type === "image") &&
      !url;

    return (
      <article
        className={`${styles.listRow} ${styles.enter}`}
        style={{ "--mo-delay": delay } as CSSProperties}
      >
        <ListThumb output={output} />

        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(output)}
            aria-label={`Open details for ${title}`}
            className={`${styles.titleBtn} ${styles.clamp1} !text-[15.5px]`}
          >
            {title}
          </button>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              className={styles.typeChip}
              style={{ background: "var(--mo-chip)", color: "var(--mo-body)" }}
            >
              {type.label}
            </span>
            <span className={styles.submittedLine}>
              Submitted {submittedLabel}
            </span>
          </div>

          <p
            className={`${styles.textBody} ${styles.clamp1} mt-1.5 text-[13px] font-medium`}
          >
            {submissionSubtitle(output)}
          </p>
        </div>

        <div className={styles.listStatus}>
          <StatusBadge status={output.status} />
          <span className="text-[12px] font-semibold" style={{ color: "var(--mo-muted)" }}>
            {reviewNote(output)}
          </span>
        </div>

        <div className={styles.listActions}>
          {output.attachment_type === "link" && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={styles.ghostBtn}
            >
              Open link
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
          {output.attachment_type === "file" &&
            (url ? (
              <a
                href={downloadUrl(
                  url,
                  safeFileName(output.file_name || title || "download")
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.ghostBtn}
              >
                Download
              </a>
            ) : (
              <button type="button" disabled className={styles.ghostBtn}>
                Download
              </button>
            ))}
          {output.attachment_type === "image" && url && (
            <button
              type="button"
              onClick={() =>
                onOpenImage({ url, name: output.file_name?.trim() || title })
              }
              className={styles.ghostBtn}
            >
              View image
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpen(output)}
            aria-label={`View details for ${title}`}
            className={styles.ghostBtn}
          >
            Details
          </button>
        </div>

        {feedback && (
          <div
            className={`${styles.listFeedback} col-span-full`}
            style={{
              background: feedbackTone.background,
              borderColor: feedbackTone.border,
            }}
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: feedbackTone.ink }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p
                className="text-[12.5px] font-extrabold"
                style={{ color: feedbackTone.ink }}
              >
                {feedbackTitle(output)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] font-medium leading-relaxed" style={{ color: "var(--mo-body)" }}>
                {output.reviewer_notes?.trim()}
              </p>
            </div>
          </div>
        )}

        {missingAttachment && (
          <div className={`${styles.unavailableNote} col-span-full`} role="status">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This attachment is no longer available. The submission record and
              its review result are unchanged.
            </span>
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className={`${styles.ocard} ${styles.enter}`}
      style={{ "--mo-delay": delay } as CSSProperties}
    >
      <OutputMediaPreview
        output={output}
        preview={preview}
        previewState={previewState}
      />

      <div className={styles.cardBody}>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onOpen(output)}
            aria-label={`Open details for ${title}`}
            className={styles.titleBtn}
          >
            {title}
          </button>
          <span className={styles.submittedLine}>
            Submitted {submittedLabel}
          </span>
        </div>

        <ReviewTimeline status={output.status} />

        <div className={styles.cardFooter}>
          <div className="min-w-0">
            {feedback ? (
              <span
                className={styles.feedbackChip}
                style={{
                  background: feedbackTone.background,
                  color: feedbackTone.ink,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: feedbackTone.dot }}
                  aria-hidden="true"
                />
                {feedbackTitle(output)}
              </span>
            ) : (
              <span
                className={`${styles.textMuted} text-[12px] font-semibold`}
              >
                {reviewNote(output)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpen(output)}
            className={styles.moreBtn}
            aria-label={`View details for ${title} — ${type.label}, ${statusLabel}`}
          >
            View details
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
