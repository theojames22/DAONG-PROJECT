"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  X,
} from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import { useBodyScrollLock } from "@/components/shared/ModalShell";
import { safeFileName } from "@/lib/file-name";
import { isSafeHttpUrl } from "@/lib/outputs";
import type { Output } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import {
  TYPE_META,
  attachmentUrl,
  downloadUrl,
  fileSizeLabel,
  formatDateTime,
  formatWorkDate,
  type PreviewState,
} from "./my-outputs-ui";
import { useFocusTrap } from "./use-focus-trap";

export interface OutputDetailsDrawerProps {
  output: Output | null;
  /** Written body for the selected row (fetched on demand by the page). */
  content?: { state: PreviewState; text?: string };
  onReloadContent: (id: string) => void;
  onClose: () => void;
}

function CopyTextButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const label =
    state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy text";

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-staff-border bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-staff-body transition-colors duration-150 hover:border-blue-200 hover:bg-staff-soft hover:text-staff-blue-ink"
    >
      {state === "copied" ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Clipboard className="h-3 w-3" aria-hidden="true" />
      )}
      <span aria-live="polite">{label}</span>
    </button>
  );
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-staff-border bg-staff-card-2 px-3.5 py-3">
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-staff-muted"
        aria-hidden="true"
      />
      <p className="text-[11.5px] leading-relaxed text-staff-body">{children}</p>
    </div>
  );
}

function LoadingLines() {
  return (
    <div className="space-y-2">
      {[100, 94, 88, 96, 70].map((width, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="block h-2.5 animate-pulse rounded bg-staff-chip"
          style={{ width: `${width}%` }}
        />
      ))}
      <span className="sr-only">Loading the written output…</span>
    </div>
  );
}

/**
 * The inline image preview, with its own failure state.
 *
 * If the stored object is missing or expired the browser would otherwise show
 * a broken-image glyph. This replaces it with a plain explanation instead —
 * the submission row itself is untouched.
 */
function DrawerImage({
  url,
  name,
  details,
}: {
  url: string;
  name: string;
  details: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="mt-2">
        <Unavailable>
          The image couldn&apos;t be displayed — it may no longer exist in
          storage. The submission itself is still recorded and reviewable.
        </Unavailable>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-staff-border bg-white">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-staff-card-2"
        title="Open the full-size image in a new tab"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="max-h-[42vh] w-full object-contain"
        />
      </a>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-staff-border px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-staff-muted">
          {details}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-staff-border bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-staff-body transition-colors duration-150 hover:border-blue-200 hover:bg-staff-soft hover:text-staff-blue-ink"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Open full size
        </a>
      </div>
    </div>
  );
}

/**
 * Right-hand details drawer for one submission.
 *
 * Rendered through a portal so no parent transform can clip it. Escape, the
 * close button and the backdrop all close it; Tab is trapped inside while it
 * is open and focus returns to the card that opened it. On phones it is a
 * full-screen sheet rather than a cramped side panel.
 *
 * Written outputs are read here — never downloaded, never treated as a file.
 */
export default function OutputDetailsDrawer({
  output,
  content,
  onReloadContent,
  onClose,
}: OutputDetailsDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  const openId = output?.id ?? null;

  useEffect(() => setMounted(true), []);

  // A newly opened row always starts in its open (not closing) state.
  useEffect(() => {
    if (!openId) return;
    closingRef.current = false;
    setClosing(false);
  }, [openId]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      onClose();
      return;
    }

    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 190);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!openId) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openId, requestClose]);

  useBodyScrollLock(Boolean(openId));
  useFocusTrap(panelRef, Boolean(openId));

  if (!mounted || !output) return null;

  const type = TYPE_META[output.attachment_type] ?? TYPE_META.file;
  const TypeIcon = type.icon;
  const title = output.title?.trim() || "Untitled output";
  const url = attachmentUrl(output);
  const size = fileSizeLabel(output);
  const feedback =
    output.status !== "pending" && output.reviewer_notes?.trim()
      ? output.reviewer_notes.trim()
      : null;
  const note = output.submission_notes?.trim() || null;
  const submittedAt =
    formatDateTime(output.created_at) || formatWorkDate(output.date);
  const reviewedAt = formatDateTime(output.reviewed_at);

  const stage = output.status === "pending" ? 0 : output.status === "checking" ? 1 : 2;
  const steps = ["Submitted", "Checking", "Decision"] as const;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm ${
          closing ? styles.backdropOut : "animate-backdrop-in"
        }`}
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${styles.drawer} relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl sm:rounded-l-3xl lg:max-w-2xl ${
          closing ? styles.drawerOut : styles.drawerIn
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-staff-border px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type.tile}`}
            >
              <TypeIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={titleId}
                  className="min-w-0 break-words text-[15px] font-extrabold leading-snug text-staff-ink"
                >
                  {title}
                </h2>
                <StatusBadge status={output.status} />
              </div>
              <p className="mt-1 text-[11.5px] font-medium text-staff-muted">
                {type.label}
                {submittedAt ? ` · Submitted ${submittedAt}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Close details"
            className="shrink-0 rounded-full p-1.5 text-staff-muted transition-colors duration-150 hover:bg-staff-chip hover:text-staff-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-5">
            {/* Work date + workflow stage */}
            <div className="flex flex-col gap-3 rounded-2xl border border-staff-border bg-staff-card-2/60 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted">
                  Work date
                </span>
                <span className="text-[11.5px] font-bold text-staff-ink">
                  {formatWorkDate(output.date) || "—"}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted">
                  Current stage
                </span>
                <ol className="mt-2 flex items-center justify-between gap-2">
                  {steps.map((step, index) => {
                    const reached = index <= stage;
                    const tone =
                      index < 2
                        ? "bg-blue-500"
                        : output.status === "rejected"
                          ? "bg-red-500"
                          : "bg-emerald-500";
                    return (
                      <li key={step} className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            reached ? tone : "bg-slate-300"
                          }`}
                          aria-hidden="true"
                        />
                        <span
                          aria-current={index === stage ? "step" : undefined}
                          className={`text-[10.5px] font-bold ${
                            index === stage ? "text-staff-ink" : "text-staff-muted"
                          }`}
                        >
                          {step}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            {/* The artifact itself */}
            {output.attachment_type === "written" && (
              <section aria-labelledby={`${titleId}-body`}>
                <div className="flex items-center justify-between gap-2">
                  <h3
                    id={`${titleId}-body`}
                    className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted"
                  >
                    Written output
                  </h3>
                  {content?.state === "ready" && content.text?.trim() ? (
                    <CopyTextButton text={content.text} />
                  ) : null}
                </div>

                {content?.state === "ready" ? (
                  content.text?.trim() ? (
                    <div className="mt-2 max-h-[46vh] overflow-y-auto overscroll-contain rounded-2xl border border-staff-border bg-white px-4 py-4">
                      <div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-staff-ink">
                        {content.text}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 rounded-2xl border border-staff-border bg-white px-4 py-3 text-[12.5px] text-staff-muted">
                      This submission has no written content.
                    </p>
                  )
                ) : content?.state === "error" ? (
                  <div className="mt-2">
                    <Unavailable>
                      <span className="block">
                        The written content couldn&apos;t be loaded.
                      </span>
                      <button
                        type="button"
                        onClick={() => onReloadContent(output.id)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-staff-border bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-staff-ink transition-colors hover:border-blue-200 hover:bg-staff-soft"
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        Try again
                      </button>
                    </Unavailable>
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-staff-border bg-white px-4 py-4">
                    <LoadingLines />
                  </div>
                )}
              </section>
            )}

            {output.attachment_type === "file" && (
              <section aria-labelledby={`${titleId}-file`}>
                <h3
                  id={`${titleId}-file`}
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted"
                >
                  Attached file
                </h3>

                <div className="mt-2 rounded-2xl border border-staff-border bg-white p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-staff-chip text-staff-body">
                      <FileText className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-[12.5px] font-bold text-staff-ink">
                        {output.file_name || title}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-staff-muted">
                        {[size, output.file_mime_type].filter(Boolean).join(" · ") ||
                          "File details unavailable"}
                      </p>
                    </div>
                  </div>

                  {url ? (
                    <a
                      href={downloadUrl(
                        url,
                        safeFileName(output.file_name || title || "download")
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-staff-blue px-3 py-2 text-[11.5px] font-bold text-white transition-colors duration-150 hover:bg-staff-blue-dark"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Download file
                    </a>
                  ) : (
                    <div className="mt-3">
                      <Unavailable>
                        This file isn&apos;t available anymore. Ask your supervisor to
                        reopen the submission if you still need it.
                      </Unavailable>
                    </div>
                  )}
                </div>
              </section>
            )}

            {output.attachment_type === "image" && (
              <section aria-labelledby={`${titleId}-image`}>
                <h3
                  id={`${titleId}-image`}
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted"
                >
                  Attached image
                </h3>

                {url ? (
                  <DrawerImage
                    key={`${output.id}-image`}
                    url={url}
                    name={output.file_name || "Submitted image"}
                    details={
                      [output.file_name, size].filter(Boolean).join(" · ") ||
                      "Image attachment"
                    }
                  />
                ) : (
                  <div className="mt-2">
                    <Unavailable>
                      <span className="inline-flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        The image preview isn&apos;t available.
                      </span>{" "}
                      The submission is still recorded and reviewable.
                    </Unavailable>
                  </div>
                )}
              </section>
            )}

            {output.attachment_type === "link" && (
              <section aria-labelledby={`${titleId}-link`}>
                <h3
                  id={`${titleId}-link`}
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted"
                >
                  Submitted link
                </h3>

                <div className="mt-2 rounded-2xl border border-staff-border bg-white p-3.5">
                  {url && isSafeHttpUrl(url) ? (
                    <>
                      <p className="break-all text-[11.5px] font-semibold text-staff-ink">
                        {url}
                      </p>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-staff-border bg-staff-soft px-3 py-2 text-[11.5px] font-bold text-staff-blue-ink transition-colors duration-150 hover:border-blue-200 hover:bg-[#e1ebff]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Open link in a new tab
                      </a>
                    </>
                  ) : (
                    <Unavailable>
                      This link isn&apos;t a valid web address, so it can&apos;t be
                      opened safely.
                    </Unavailable>
                  )}
                </div>
              </section>
            )}

            {/* The staff member's own note */}
            {note && (
              <section aria-labelledby={`${titleId}-note`}>
                <h3
                  id={`${titleId}-note`}
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted"
                >
                  Your note
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-staff-border bg-white px-3.5 py-3 text-[12px] leading-relaxed text-staff-body">
                  {note}
                </p>
              </section>
            )}

            {/* Reviewer feedback */}
            <section aria-labelledby={`${titleId}-review`}>
              <h3
                id={`${titleId}-review`}
                className="text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted"
              >
                Review
              </h3>

              {output.status === "pending" ? (
                <p className="mt-2 rounded-2xl border border-staff-border bg-white px-3.5 py-3 text-[11.5px] leading-relaxed text-staff-body">
                  Waiting for your supervisor to review this output.
                </p>
              ) : output.status === "checking" ? (
                <div className="mt-2 rounded-2xl border border-staff-border bg-white px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-staff-blue-ink">
                      In review
                    </span>
                    {reviewedAt && (
                      <span className="text-[10.5px] font-medium text-staff-muted">
                        {reviewedAt}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-staff-ink">
                    {feedback ?? "Your supervisor is reviewing this output."}
                  </p>
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border border-staff-border bg-white px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-[10.5px] font-bold uppercase tracking-[0.06em] ${
                        output.status === "rejected"
                          ? "text-staff-danger"
                          : "text-staff-success"
                      }`}
                    >
                      {output.status === "rejected" ? "Rejected" : "Approved"}
                    </span>
                    <span className="text-[10.5px] font-medium text-staff-muted">
                      {reviewedAt || "Reviewed"}
                    </span>
                  </div>
                  <p className="mt-1 text-[10.5px] font-medium text-staff-muted">
                    {output.reviewed_by
                      ? "Reviewed by your supervisor"
                      : "Decision recorded"}
                  </p>

                  {feedback ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-staff-ink">
                      {feedback}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11.5px] text-staff-body">
                      No written feedback was provided.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-staff-border px-4 py-3 sm:px-6">
          <span className="min-w-0 truncate text-[10.5px] font-medium text-staff-muted">
            {submittedAt ? `Submitted ${submittedAt}` : "Submission details"}
          </span>
          <button
            type="button"
            onClick={requestClose}
            className={`${styles.btnGhost} rounded-xl border border-staff-border bg-white px-4 py-2 text-[11.5px] font-bold text-staff-ink`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
