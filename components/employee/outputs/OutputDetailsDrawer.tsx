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
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import { useBodyScrollLock } from "@/components/shared/ModalShell";
import { safeFileName } from "@/lib/file-name";
import { isSafeHttpUrl } from "@/lib/outputs";
import type { Output } from "@/lib/types";
import ReviewTimeline from "./ReviewTimeline";
import {
  STATUS_META,
  TYPE_META,
  attachmentUrl,
  downloadUrl,
  fileSizeLabel,
  formatDateTime,
  formatShortDate,
  formatTurnaround,
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
  /** Opens the full-screen image preview above this drawer. */
  onOpenImage: (image: { url: string; name: string }) => void;
  /** True while the higher-z lightbox owns focus and Escape. */
  imageOpen?: boolean;
}

function Meta({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className={styles.metaCard}>
      <span className={styles.eyebrow}>{label}</span>
      <span className={styles.metaValue} title={title}>
        {value}
      </span>
    </div>
  );
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
      className={styles.tinyBtn}
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
    <div className={styles.unavailableNote}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function LoadingLines() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      {[100, 94, 88, 96, 70].map((width, index) => (
        <span
          key={index}
          className={styles.skeleton}
          style={{ height: 10, width: `${width}%`, borderRadius: 5 }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Loading the written output…</span>
    </div>
  );
}

/**
 * The inline image preview, with its own failure state.
 *
 * If the stored object is missing the browser would otherwise show a broken
 * image glyph. This replaces it with a plain explanation instead; the
 * submission row itself is untouched.
 */
function DrawerImage({
  url,
  name,
  onOpen,
}: {
  url: string;
  name: string;
  onOpen: (image: { url: string; name: string }) => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Unavailable>
        The image couldn&apos;t be displayed — it may no longer exist in storage.
        The submission itself is still recorded and reviewable.
      </Unavailable>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen({ url, name })}
      aria-label={`View ${name} larger`}
      className={styles.imageFrame}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <span className={`${styles.glass} ${styles.viewLarger}`}>
        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        View larger
      </span>
    </button>
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
 * Timeline entries use only stored timestamps; when a transition has no stored
 * time, the entry says so rather than inventing one.
 */
export default function OutputDetailsDrawer({
  output,
  content,
  onReloadContent,
  onClose,
  onOpenImage,
  imageOpen = false,
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
    closeTimer.current = window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!openId) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || imageOpen) return;
      event.preventDefault();
      requestClose();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [imageOpen, openId, requestClose]);

  useBodyScrollLock(Boolean(openId));
  useFocusTrap(panelRef, Boolean(openId) && !imageOpen);

  if (!mounted || !output) return null;

  const type = TYPE_META[output.attachment_type] ?? TYPE_META.file;
  const TypeIcon = type.icon;
  const status = STATUS_META[output.status] ?? STATUS_META.pending;
  const StatusIcon = status.icon;
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
  const turnaround = formatTurnaround(output.created_at, output.reviewed_at);
  const decided = output.status === "done" || output.status === "rejected";

  const decidedShort = formatShortDate(output.reviewed_at);
  const heroNote =
    output.status === "pending"
      ? "Your supervisor hasn't started reviewing this submission yet."
      : output.status === "checking"
        ? reviewedAt
          ? `Review started ${reviewedAt}.`
          : "Your supervisor is reviewing this submission now."
        : output.status === "done"
          ? decidedShort
            ? `Approved on ${decidedShort}.`
            : "This submission was approved."
          : decidedShort
            ? `Changes were requested on ${decidedShort}. See the feedback below.`
            : "Changes were requested on this submission. See the feedback below.";

  const history: Array<{
    key: string;
    label: string;
    when: string;
    dot: string;
    description?: string;
  }> = [
    {
      key: "submitted",
      label: "Submitted",
      when: submittedAt || "Timestamp not recorded",
      dot: "var(--mo-blue)",
      description: "Sent to your supervisor for review.",
    },
  ];

  if (output.status !== "pending") {
    history.push({
      key: "checking",
      label: "Checking",
      when:
        output.status === "checking"
          ? reviewedAt || "Timestamp not recorded"
          : "Timestamp not recorded",
      dot: "var(--mo-blue)",
      description:
        output.status === "checking"
          ? "Your supervisor is reviewing this submission."
          : "The review stage was completed.",
    });
  }

  if (decided) {
    history.push({
      key: "decision",
      label: output.status === "done" ? "Approved" : "Rejected",
      when: reviewedAt || "Timestamp not recorded",
      dot:
        output.status === "done"
          ? "var(--mo-success)"
          : "var(--mo-danger)",
      description:
        output.status === "done"
          ? "The submission was approved."
          : "The submission needs changes before it can be approved.",
    });
  }

  return createPortal(
    <div className={`${styles.scope} ${styles.drawerRoot}`}>
      <div
        className={`${styles.drawerBackdrop} ${
          closing ? styles.drawerBackdropOut : ""
        }`}
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${styles.drawerPanel} ${
          closing ? styles.drawerPanelOut : ""
        }`}
      >
        <div className={styles.drawerHeader}>
          <span
            className={styles.drawerIcon}
            style={{ background: type.thumbBg, color: type.thumbFg }}
          >
            <TypeIcon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <span className={styles.typeChip}>{type.label}</span>
            <h2 id={titleId} className={`${styles.drawerTitle} mt-1.5`}>
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Close details"
            className={styles.drawerClose}
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className={styles.drawerScroll}>
          <div className={styles.drawerHero} style={{ background: status.hero }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={styles.heroLabel}>Review status</p>
                <p className={styles.heroTitle}>{status.label}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-[11.5px] font-extrabold">
                <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {status.summary}
              </span>
            </div>
            <p className={styles.heroNote}>{heroNote}</p>
          </div>

          <div className={styles.metaGrid}>
            <Meta label="Work date" value={formatWorkDate(output.date) || "—"} />
            <Meta
              label="Submitted"
              value={submittedAt || "—"}
              title={submittedAt || undefined}
            />
            <Meta
              label="Last update"
              value={reviewedAt || "—"}
              title={reviewedAt || undefined}
            />
            <Meta label="Review time" value={turnaround || "—"} />
          </div>

          <section className={styles.drawerSection} aria-labelledby={`${titleId}-progress`}>
            <h3 id={`${titleId}-progress`} className={styles.sectionTitle}>
              Review progress
            </h3>
            <div className={`${styles.contentCard} !py-4`}>
              <ReviewTimeline status={output.status} />
            </div>
          </section>

          {output.attachment_type === "written" && (
            <section className={styles.drawerSection} aria-labelledby={`${titleId}-body`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`${titleId}-body`} className={styles.sectionTitle}>
                  Written output
                </h3>
                {content?.state === "ready" && content.text?.trim() ? (
                  <CopyTextButton text={content.text} />
                ) : null}
              </div>

              {content?.state === "ready" ? (
                content.text?.trim() ? (
                  <div
                    className={`${styles.contentCard} max-h-[46vh] overflow-y-auto overscroll-contain`}
                  >
                    {content.text}
                  </div>
                ) : (
                  <p className={styles.contentCard}>
                    This submission has no written content.
                  </p>
                )
              ) : content?.state === "error" ? (
                <Unavailable>
                  <span className="block">
                    The written content couldn&apos;t be loaded.
                  </span>
                  <button
                    type="button"
                    onClick={() => onReloadContent(output.id)}
                    className={`${styles.tinyBtn} mt-2.5`}
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Try again
                  </button>
                </Unavailable>
              ) : (
                <div className={styles.contentCard}>
                  <LoadingLines />
                </div>
              )}
            </section>
          )}

          {output.attachment_type === "file" && (
            <section className={styles.drawerSection} aria-labelledby={`${titleId}-file`}>
              <h3 id={`${titleId}-file`} className={styles.sectionTitle}>
                Attached file
              </h3>

              <div className={styles.attachmentRow}>
                <span className={styles.attachmentIcon}>
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={styles.attachmentName}>
                    {output.file_name || title}
                  </p>
                  <p className={styles.attachmentMeta}>
                    {[size, output.file_mime_type].filter(Boolean).join(" · ") ||
                      "File details unavailable"}
                  </p>
                </div>

                {url ? (
                  <a
                    href={downloadUrl(
                      url,
                      safeFileName(output.file_name || title || "download")
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.ghostBtn} ${styles.attachmentAction}`}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download file
                  </a>
                ) : null}
              </div>

              {!url && (
                <Unavailable>
                  This file isn&apos;t available anymore. The submission record and
                  its review result are unchanged.
                </Unavailable>
              )}
            </section>
          )}

          {output.attachment_type === "image" && (
            <section className={styles.drawerSection} aria-labelledby={`${titleId}-image`}>
              <h3 id={`${titleId}-image`} className={styles.sectionTitle}>
                Attached image
              </h3>

              {url ? (
                <>
                  <DrawerImage
                    key={`${output.id}-image`}
                    url={url}
                    name={output.file_name || "Submitted image"}
                    onOpen={onOpenImage}
                  />
                  <p className={styles.attachmentMeta}>
                    {[output.file_name, size].filter(Boolean).join(" · ") ||
                      "Image attachment"}
                  </p>
                </>
              ) : (
                <Unavailable>
                  <span className="inline-flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    The image preview isn&apos;t available.
                  </span>{" "}
                  The submission is still recorded and reviewable.
                </Unavailable>
              )}
            </section>
          )}

          {output.attachment_type === "link" && (
            <section className={styles.drawerSection} aria-labelledby={`${titleId}-link`}>
              <h3 id={`${titleId}-link`} className={styles.sectionTitle}>
                Submitted link
              </h3>

              {url && isSafeHttpUrl(url) ? (
                <div className={styles.attachmentRow}>
                  <span className={styles.attachmentIcon}>
                    <ExternalLink className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className={`${styles.attachmentName} min-w-0 flex-1 break-all`}>
                    {url}
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={`${styles.ghostBtn} ${styles.attachmentAction}`}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Open link
                  </a>
                </div>
              ) : (
                <Unavailable>
                  This link isn&apos;t a valid web address, so it can&apos;t be
                  opened safely.
                </Unavailable>
              )}
            </section>
          )}

          {note && (
            <section className={styles.drawerSection} aria-labelledby={`${titleId}-note`}>
              <h3 id={`${titleId}-note`} className={styles.sectionTitle}>
                Your note
              </h3>
              <p className={styles.contentCard}>{note}</p>
            </section>
          )}

          <section className={styles.drawerSection} aria-labelledby={`${titleId}-review`}>
            <h3 id={`${titleId}-review`} className={styles.sectionTitle}>
              Review feedback
            </h3>

            {output.status === "pending" ? (
              <p className={styles.contentCard}>
                Waiting for your supervisor to review this output.
              </p>
            ) : output.status === "checking" ? (
              <div
                className={styles.feedbackCard}
                style={{
                  background: "var(--mo-blue-soft)",
                  color: "var(--mo-blue-ink)",
                  borderColor: "var(--mo-blue)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.08em]">
                    In review
                  </span>
                  <span className={styles.attachmentMeta}>
                    {reviewedAt || "Review in progress"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed" style={{ color: "var(--mo-body)" }}>
                  {feedback ?? "Your supervisor is reviewing this output."}
                </p>
              </div>
            ) : (
              <div
                className={styles.feedbackCard}
                style={{
                  background:
                    output.status === "done"
                      ? "var(--mo-success-soft)"
                      : "var(--mo-danger-soft)",
                  color:
                    output.status === "done"
                      ? "var(--mo-success-ink)"
                      : "var(--mo-danger-ink)",
                  borderColor:
                    output.status === "done"
                      ? "var(--mo-success)"
                      : "var(--mo-danger)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.08em]">
                    {status.label}
                  </span>
                  <span className={styles.attachmentMeta}>
                    {reviewedAt || "Reviewed"}
                  </span>
                </div>
                <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--mo-muted)" }}>
                  {output.reviewed_by
                    ? "Reviewed by your supervisor"
                    : "Decision recorded"}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed" style={{ color: "var(--mo-body)" }}>
                  {feedback ?? "No written feedback was provided."}
                </p>
              </div>
            )}
          </section>

          <section className={styles.drawerSection} aria-labelledby={`${titleId}-history`}>
            <h3 id={`${titleId}-history`} className={styles.sectionTitle}>
              Status history
            </h3>
            <ol className={styles.historyList}>
              {history.map((entry, index) => {
                const last = index === history.length - 1;
                return (
                  <li
                    key={entry.key}
                    className={styles.historyItem}
                    style={last ? { paddingBottom: 0 } : undefined}
                  >
                    <span className={styles.historyRail} aria-hidden="true">
                      <span
                        className={styles.historyDot}
                        style={{ background: entry.dot }}
                      />
                      {!last && <span className={styles.historyLine} />}
                    </span>
                    <div className="min-w-0 pb-0.5">
                      <p className={styles.historyLabel}>{entry.label}</p>
                      <p className={styles.historyWhen}>{entry.when}</p>
                      {entry.description && (
                        <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: "var(--mo-body)" }}>
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className={styles.drawerFooter}>
          <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--mo-muted)" }}>
            {submittedAt ? `Submitted ${submittedAt}` : "Submission details"}
          </span>
          <button
            type="button"
            onClick={requestClose}
            className={styles.ghostBtn}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
