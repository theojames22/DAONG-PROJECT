"use client";

import { useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import type { AttachmentType } from "@/lib/types";
import { isSafeHttpUrl } from "@/lib/outputs";
import { safeFileName } from "@/lib/file-name";
import WrittenOutputViewer from "./WrittenOutputViewer";

export interface SubmissionActionProps {
  type: AttachmentType | null | undefined;
  title: string;
  url?: string | null;
  /** The written body, when the caller already has it. */
  content?: string | null;
  /** Fetches the body on demand when `content` is not provided (list views). */
  outputId?: string | null;
  notes?: string | null;
  notesLabel?: string;
  /** The mirrored review row — used for the authorized download route. */
  projectId?: string | null;
  fileName?: string | null;
  submitter?: string | null;
  date?: string | null;
  statusSlot?: React.ReactNode;
  variant?: "button" | "inline";
  className?: string;
  /** Overrides the button/link text. */
  label?: string;
}

/**
 * One type-aware action for a submission.
 *
 *   written → opens the read-only viewer (never a download)
 *   file    → the existing authorized download route
 *   image   → the stored image
 *   link    → an anchor, but ONLY for http(s) URLs
 *
 * Every URL is re-checked with `isSafeHttpUrl` at render time, so a legacy
 * row containing `javascript:` can never become a clickable link.
 */
export default function SubmissionAction({
  type,
  title,
  url,
  content,
  outputId,
  notes,
  notesLabel,
  projectId,
  fileName,
  submitter,
  date,
  statusSlot,
  variant = "button",
  className,
  label,
}: SubmissionActionProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [fetchedBody, setFetchedBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const styleClass =
    variant === "button"
      ? className ?? "btn-secondary"
      : className ?? "font-semibold text-blue-600 hover:underline";
  const mutedClass =
    "inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-400";

  const safeUrl = url && isSafeHttpUrl(url) ? url : null;
  const fileHref = projectId
    ? `/api/projects/${encodeURIComponent(projectId)}/file`
    : outputId
      ? `/api/outputs/${encodeURIComponent(outputId)}/file`
      : safeUrl;
  const body = (fetchedBody ?? content ?? "").trim();

  const icon =
    type === "written" ? (
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
    ) : type === "link" ? (
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    ) : type === "image" ? (
      <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
    );

  async function openWritten() {
    setLoadError(null);

    if (body || !outputId) {
      setViewerOpen(true);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/outputs/${outputId}/content`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("unavailable");
      const data = (await response.json()) as { content?: string; notes?: string };
      setFetchedBody(data.content ?? "");
      setViewerOpen(true);
    } catch {
      setLoadError("Could not load the written content. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------- written
  if (type === "written") {
    // No body in memory and nothing to fetch it with — say so honestly
    // rather than opening an empty reader.
    if (!body && !outputId) {
      return (
        <span className={mutedClass}>
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Content unavailable
        </span>
      );
    }

    return (
      <span className="inline-flex min-w-0 flex-col items-start gap-0.5">
        <button
          type="button"
          onClick={openWritten}
          disabled={loading}
          className={styleClass}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            icon
          )}
          {loading ? "Opening…" : label ?? "Read submission"}
        </button>
        {loadError && (
          <span role="alert" className="text-[10.5px] font-medium text-red-600">
            {loadError}
          </span>
        )}
        <WrittenOutputViewer
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          title={title}
          content={fetchedBody ?? content ?? ""}
          submitter={submitter}
          date={date}
          statusSlot={statusSlot}
          notes={notes}
          notesLabel={notesLabel}
        />
      </span>
    );
  }

  // ------------------------------------------------------------------- link
  if (type === "link") {
    if (!safeUrl) {
      return <span className={mutedClass}>Link unavailable</span>;
    }
    return (
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={styleClass}
      >
        {icon}
        {label ?? "Open link"}
      </a>
    );
  }

  // ------------------------------------------------------------------ image
  if (type === "image") {
    if (!fileHref) {
      return <span className={mutedClass}>Image unavailable</span>;
    }
    return (
      <a
        href={fileHref}
        target="_blank"
        rel="noopener noreferrer"
        className={styleClass}
      >
        {icon}
        {label ?? "Open image"}
      </a>
    );
  }

  // ------------------------------------------------------------------- file
  if (fileHref) {
    const href = fileHref.startsWith("/api/")
      ? `${fileHref}${fileHref.includes("?") ? "&" : "?"}download=1`
      : fileHref;
    return (
      <a
        href={href}
        download={safeFileName(fileName || title || "download")}
        className={styleClass}
      >
        {icon}
        {label ?? "Download file"}
      </a>
    );
  }
  return <span className={mutedClass}>Attachment unavailable</span>;
}
