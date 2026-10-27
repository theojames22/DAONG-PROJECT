"use client";

import { useState } from "react";
import {
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
} from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import type { Output } from "@/lib/types";
import {
  STATUS_META,
  TYPE_META,
  attachmentUrl,
  fileExtension,
  fileSizeLabel,
  type PreviewState,
} from "./my-outputs-ui";

export interface OutputMediaPreviewProps {
  output: Output;
  /** Written body fetched on demand for the visible page only. */
  preview?: string | null;
  previewState: PreviewState;
}

function splitUrl(value: string): { host: string; path: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = `${url.pathname}${url.search}`;
    return {
      host: url.host,
      path:
        path === "/"
          ? "/"
          : path.length > 40
            ? `${path.slice(0, 37)}…`
            : path,
    };
  } catch {
    return null;
  }
}

function PreviewSkeleton() {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-2">
      <span
        className={styles.skeleton}
        style={{ height: 11, width: "100%", borderRadius: 6 }}
        aria-hidden="true"
      />
      <span
        className={styles.skeleton}
        style={{ height: 11, width: "92%", borderRadius: 6 }}
        aria-hidden="true"
      />
      <span
        className={styles.skeleton}
        style={{ height: 11, width: "68%", borderRadius: 6 }}
        aria-hidden="true"
      />
      <span className="sr-only">Loading preview…</span>
    </span>
  );
}

/**
 * The 164px visual preview at the top of a grid card.
 *
 * Every value is real: the written excerpt comes from /api/outputs/[id]/content,
 * the file name/size from the output row, the image from the existing storage
 * URL, and the link host/path from the submitted URL. Missing assets get a
 * neutral explanation — never placeholder artwork or invented metadata.
 */
export default function OutputMediaPreview({
  output,
  preview,
  previewState,
}: OutputMediaPreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const type = TYPE_META[output.attachment_type] ?? TYPE_META.file;
  const TypeIcon = type.icon;
  const status = STATUS_META[output.status] ?? STATUS_META.pending;
  const url = attachmentUrl(output);
  const isImage = output.attachment_type === "image";
  const showImage = isImage && !!url && !imageFailed;
  const fileMissing =
    (output.attachment_type === "file" || isImage) && !url;

  return (
    <div
      className={styles.ocardMedia}
      style={{ background: type.mediaBg }}
    >
      <span className={styles.mediaPattern} aria-hidden="true" />

      {output.attachment_type === "written" && (
        <div className={styles.writtenPreview}>
          <span className={styles.writtenRule} aria-hidden="true" />
          {previewState === "ready" ? (
            preview?.trim() ? (
              <p className={`${styles.writtenText} ${styles.clamp4}`}>{preview}</p>
            ) : (
              <p className={styles.writtenText}>
                This submission has no written content.
              </p>
            )
          ) : previewState === "error" ? (
            <p className={styles.writtenText}>Open the output to read it.</p>
          ) : (
            <PreviewSkeleton />
          )}
        </div>
      )}

      {output.attachment_type === "file" && (
        <div className={styles.filePreview}>
          <span className={styles.fileTile} aria-hidden="true">
            <span className={styles.fileFold} />
            {fileExtension(output.file_name)}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className={`${styles.fileName} ${styles.clamp1}`}>
              {output.file_name?.trim() || "File attachment"}
            </span>
            <span className={styles.fileMeta}>
              {fileSizeLabel(output) ?? "Size unavailable"}
            </span>
          </span>
        </div>
      )}

      {isImage && showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={output.file_name?.trim() || output.title?.trim() || "Submitted image"}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      {output.attachment_type === "link" && (
        <div className={styles.linkPreview}>
          {(() => {
            const parts = url ? splitUrl(url) : null;
            if (!parts) {
              return (
                <span className="flex min-w-0 items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={styles.fileName}>Link unavailable</span>
                </span>
              );
            }
            return (
              <>
                <span className={styles.linkCircle} aria-hidden="true">
                  <LinkIcon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`${styles.linkHost} ${styles.clamp1}`}>
                    {parts.host}
                  </span>
                  <span className={`${styles.linkPath} ${styles.clamp1}`}>
                    {parts.path}
                  </span>
                </span>
              </>
            );
          })()}
        </div>
      )}

      {(fileMissing || (isImage && imageFailed)) && (
        <div className={styles.mediaFallback} role="status">
          {isImage ? (
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <FileText className="h-5 w-5" aria-hidden="true" />
          )}
          <span className={styles.mediaFallbackText}>
            {isImage ? "Image preview unavailable" : "This attachment is unavailable"}
          </span>
          <span className="text-[11.5px] font-medium">
            The submission record is still here.
          </span>
        </div>
      )}

      <span
        className={`${styles.glass} ${styles.mediaBadge} ${styles.mediaBadgeType}`}
      >
        <TypeIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {type.label}
      </span>

      <span
        className={`${styles.mediaBadge} ${styles.mediaBadgeStatus}`}
        style={{ color: status.badgeFg }}
      >
        <span
          className={styles.statusDot}
          style={{ background: status.dot }}
          aria-hidden="true"
        />
        {status.label}
      </span>
    </div>
  );
}
