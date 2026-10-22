"use client";

import { useState } from "react";
import { ArrowRight, Image as ImageIcon } from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import type { Output } from "@/lib/types";
import {
  TYPE_META,
  attachmentUrl,
  fileSizeLabel,
  formatShortDate,
  formatSubmittedStamp,
  hasFeedback,
  shortenUrl,
  submissionSubtitle,
  type PreviewState,
  type ViewMode,
} from "./my-outputs-ui";
import StatusBadge from "./StatusBadge";

export interface OutputItemProps {
  output: Output;
  view: ViewMode;
  /** Written body preview — only ever fetched for the visible page. */
  preview?: string | null;
  previewState: PreviewState;
  onOpen: (output: Output) => void;
}

function titleOf(output: Output): string {
  return output.title?.trim() || "Untitled output";
}

/**
 * The written preview is the only part of a card that can still be in flight.
 * While it loads the card shows neutral placeholder lines — never invented
 * text, and never a blank hole that shifts the layout when the body arrives.
 */
function WrittenPreview({ state, text }: { state: PreviewState; text?: string | null }) {
  if (state === "ready") {
    if (!text || !text.trim()) {
      return (
        <p className="mt-1 text-[11.5px] italic text-staff-muted">
          This submission has no written content.
        </p>
      );
    }
    return (
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-staff-body">
        {text}
      </p>
    );
  }

  if (state === "error") {
    return (
      <p className="mt-1 text-[11.5px] font-medium text-staff-muted">
        Open the output to read it.
      </p>
    );
  }

  return (
    <span className="mt-2 block space-y-1.5">
      <span
        className="block h-2 w-full animate-pulse rounded bg-staff-chip"
        aria-hidden="true"
      />
      <span
        className="block h-2 w-11/12 animate-pulse rounded bg-staff-chip"
        aria-hidden="true"
      />
      <span
        className="block h-2 w-2/3 animate-pulse rounded bg-staff-chip"
        aria-hidden="true"
      />
      <span className="sr-only">Loading preview…</span>
    </span>
  );
}

function SecondaryLine({ output }: { output: Output }) {
  const size = fileSizeLabel(output);

  if (output.attachment_type === "file") {
    const meta = [size, output.file_mime_type].filter(Boolean).join(" · ");
    return (
      <>
        <p className="mt-1 line-clamp-1 break-all text-[11.5px] font-semibold text-staff-body">
          {output.file_name || "File attachment"}
        </p>
        {meta && <p className="mt-0.5 text-[10.5px] text-staff-muted">{meta}</p>}
      </>
    );
  }

  if (output.attachment_type === "image") {
    return (
      <p className="mt-1 line-clamp-1 break-all text-[11.5px] font-semibold text-staff-body">
        {output.file_name || "Image attachment"}
      </p>
    );
  }

  const url = attachmentUrl(output);
  if (!url) {
    return (
      <p className="mt-1 text-[11.5px] font-medium text-staff-muted">
        Link unavailable
      </p>
    );
  }

  return (
    <p className="mt-1 line-clamp-1 break-all text-[11.5px] font-semibold text-staff-blue-ink">
      {shortenUrl(url)}
    </p>
  );
}

/**
 * One submission, as a card or a list row.
 *
 * The whole surface is clickable through an absolutely-positioned button with
 * an `sr-only` label — valid HTML inside a card full of block content, one
 * keyboard stop, and a visible focus ring on the card itself.
 */
export default function OutputItem({
  output,
  view,
  preview,
  previewState,
  onOpen,
}: OutputItemProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const type = TYPE_META[output.attachment_type] ?? TYPE_META.file;
  const TypeIcon = type.icon;
  const title = titleOf(output);
  const url = attachmentUrl(output);
  const showThumbnail =
    output.attachment_type === "image" && !!url && !imageFailed;
  const feedback = hasFeedback(output);
  const reviewedLabel = formatShortDate(output.reviewed_at);
  const submittedLabel = formatSubmittedStamp(output);

  if (view === "list") {
    return (
      <div
        className={`${styles.listRow} group relative flex items-center gap-3 border-b border-staff-border/70 bg-white px-3.5 py-3 last:border-b-0 sm:px-4`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${type.tile}`}
        >
          <TypeIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="line-clamp-1 break-words text-[12.5px] font-bold text-staff-ink">
              {title}
            </p>
            {feedback && (
              <span className="inline-flex items-center gap-1 rounded-full bg-staff-soft px-1.5 py-0.5 text-[9.5px] font-bold text-staff-blue-ink">
                <span
                  className="h-1 w-1 rounded-full bg-staff-blue-ink"
                  aria-hidden="true"
                />
                Feedback
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 break-all text-[11px] text-staff-body">
            {submissionSubtitle(output)}
          </p>
          {/* Phones hide the right column, so the timestamp moves inline. */}
          <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-staff-muted sm:hidden">
            {submittedLabel}
            {reviewedLabel ? ` · Reviewed ${reviewedLabel}` : ""}
          </p>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-0.5 text-[10.5px] font-semibold leading-tight text-staff-muted sm:flex">
          <span>{type.label}</span>
          <span className="whitespace-nowrap">{submittedLabel}</span>
          {reviewedLabel && (
            <span className="whitespace-nowrap font-medium">
              Reviewed {reviewedLabel}
            </span>
          )}
        </div>

        <StatusBadge status={output.status} />

        <ArrowRight
          className="h-4 w-4 shrink-0 text-staff-muted transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => onOpen(output)}
          className={`${styles.overlay} absolute inset-0 z-10 rounded-xl`}
        >
          <span className="sr-only">
            View details for {title} — {type.label}, {STATUS_LABEL_FOR_SR(output)}
          </span>
        </button>
      </div>
    );
  }

  return (
    <article
      className={`${styles.card} group relative flex h-full flex-col gap-3.5 rounded-2xl border border-staff-border bg-white p-4 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.05)]`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type.tile}`}
        >
          <TypeIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        </span>
        <StatusBadge status={output.status} />
      </div>

      {output.attachment_type === "image" && url && (
        <>
          {showThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="h-32 w-full rounded-xl border border-staff-border object-cover"
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-staff-border bg-staff-card-2 text-[11px] font-medium text-staff-muted">
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              Preview unavailable
            </div>
          )}
        </>
      )}

      <div className="min-w-0">
        <h3 className="line-clamp-2 break-words text-[13.5px] font-bold leading-snug text-staff-ink">
          {title}
        </h3>

        {output.attachment_type === "written" ? (
          <WrittenPreview state={previewState} text={preview} />
        ) : (
          <SecondaryLine output={output} />
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-staff-border/70 pt-3">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] font-semibold text-staff-muted">
          <span>{type.label}</span>
          <span aria-hidden="true">·</span>
          <span>{submittedLabel}</span>
          {output.attachment_type === "file" && fileSizeLabel(output) && (
            <>
              <span aria-hidden="true">·</span>
              <span>{fileSizeLabel(output)}</span>
            </>
          )}
        </div>

        {reviewedLabel && (
          <p className="text-[10px] font-semibold text-staff-muted">
            Reviewed {reviewedLabel}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {feedback ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-staff-soft px-2 py-0.5 text-[10px] font-bold text-staff-blue-ink">
              <span
                className="h-1.5 w-1.5 rounded-full bg-staff-blue-ink"
                aria-hidden="true"
              />
              Feedback available
            </span>
          ) : (
            <span />
          )}

          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-staff-blue-ink">
            View details
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpen(output)}
        className={`${styles.overlay} absolute inset-0 z-10 rounded-2xl`}
      >
        <span className="sr-only">
          View details for {title} — {type.label}, {STATUS_LABEL_FOR_SR(output)}
        </span>
      </button>
    </article>
  );
}

/** Screen-reader only status word (the visible pill is decorative for the name). */
function STATUS_LABEL_FOR_SR(output: Output): string {
  return output.status === "done" ? "Approved" : output.status;
}
