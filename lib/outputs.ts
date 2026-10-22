import type { AttachmentType } from "./types";

/**
 * Shared rules for output submissions.
 *
 * This module is imported by BOTH the staff form (client bundle) and the
 * submission route (server). Keeping one implementation means the browser
 * cannot be the only thing enforcing a limit: every rule below is re-run
 * server-side before anything is stored.
 */

export type SubmissionType = AttachmentType;

export const SUBMISSION_TYPES: SubmissionType[] = [
  "written",
  "file",
  "image",
  "link",
];

/** Maximum written body, in Unicode code points (matches Postgres char_length). */
export const WRITTEN_CONTENT_MAX = 20_000;

/** Maximum submission title. */
export const TITLE_MAX = 160;

/** Maximum "notes for the reviewer" text. */
export const NOTES_MAX = 2_000;

/** Maximum attachment size — matches the storage bucket limit. */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Types the storage bucket accepts. Must stay in sync with
 * `allowed_mime_types` in supabase/written_outputs.sql.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** Extensions offered in the file picker, derived from the list above. */
export const ACCEPTED_FILE_EXTENSIONS =
  ".pdf,.doc,.docx,.xlsx,.pptx,.zip,.txt,.png,.jpg,.jpeg,.webp,.gif";

export const ACCEPTED_IMAGE_EXTENSIONS =
  ".png,.jpg,.jpeg,.webp,.gif";

const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/i;

/** True when the storage bucket will accept this MIME type. */
export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(
    (mime || "").toLowerCase()
  );
}

/** Code points, not UTF-16 units — matches Postgres char_length(). */
export function countCharacters(value: string): number {
  return Array.from(value).length;
}

/**
 * Normalise a written body before it is stored.
 * Line endings become "\n", trailing spaces per line are dropped, and the
 * outer blank lines are trimmed. No HTML is ever produced or interpreted.
 */
export function normalizeContent(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/**
 * Accepts only absolute http(s) URLs. This is what stops `javascript:`,
 * `data:`, `file:` and `vbscript:` payloads from ever reaching an anchor.
 */
export function isSafeHttpUrl(value: string): boolean {
  const candidate = (value || "").trim();
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** UUID v4-ish check — the client-supplied id is also the idempotency key. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || ""
  );
}

/**
 * A uuid generated once per submission attempt. Repeated clicks and retries
 * reuse the same value, so the server can recognise a duplicate insert
 * instead of creating a second output row.
 */
export function newSubmissionId(): string {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  // Fallback for older/insecure contexts: RFC 4122 version 4 layout.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SubmissionInput {
  type: SubmissionType;
  title: string;
  content?: string | null;
  link?: string | null;
  notes?: string | null;
  file?: { name: string; size: number; type: string } | null;
}

/**
 * Attachment-only rules, so the form can give instant feedback the moment
 * a file is chosen instead of waiting for submit.
 */
export function validateAttachment(
  type: SubmissionType,
  file: { name: string; size: number; type: string } | null | undefined
): string | null {
  if (!file || !file.name) {
    return type === "image"
      ? "Still needed: a screenshot."
      : "Still needed: a document or file.";
  }
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_FILE_SIZE) {
    return `That file is ${formatFileSize(file.size)} — the limit is ${formatFileSize(MAX_FILE_SIZE)}.`;
  }
  if (type === "image" && !IMAGE_MIME.test(file.type || "")) {
    return "Screenshots must be PNG, JPG, WEBP or GIF images.";
  }
  if (type === "file" && !isAllowedMime(file.type)) {
    return "That file type isn't supported. Use PDF, DOC, DOCX, XLSX, PPTX, ZIP, TXT or an image.";
  }
  return null;
}

/**
 * The single validation rule set for every submission type.
 * Returns a human-readable error, or null when the submission is valid.
 */
export function validateSubmission(input: SubmissionInput): string | null {
  if (!SUBMISSION_TYPES.includes(input.type)) {
    return "Choose a submission type.";
  }

  const title = (input.title || "").trim();
  if (!title) return "Still needed: a deliverable name.";
  if (countCharacters(title) > TITLE_MAX) {
    return `The deliverable name is too long (maximum ${TITLE_MAX} characters).`;
  }

  const notes = (input.notes || "").trim();
  if (countCharacters(notes) > NOTES_MAX) {
    return `The note to your supervisor is too long (maximum ${NOTES_MAX} characters).`;
  }

  if (input.type === "written") {
    const body = normalizeContent(input.content || "");
    if (!body) return "Still needed: the written output itself.";
    if (countCharacters(body) > WRITTEN_CONTENT_MAX) {
      return `The written output is too long (${countCharacters(body).toLocaleString()} of ${WRITTEN_CONTENT_MAX.toLocaleString()} characters).`;
    }
    return null;
  }

  if (input.type === "link") {
    const link = (input.link || "").trim();
    if (!link) return "Still needed: a link.";
    if (!isSafeHttpUrl(link)) {
      return "That link is not a valid http(s) address.";
    }
    return null;
  }

  // file | image — the attachment is mandatory and must pass the bucket rules.
  return validateAttachment(input.type, input.file);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export type UploadErrorCode =
  | "FILE_TOO_LARGE"
  | "STORAGE_FULL"
  | "UNSUPPORTED_FILE"
  | "UPLOAD_FAILED";

/**
 * Classifies a storage-provider failure into the message the staff member
 * actually needs: "too big", "storage is full", or "the upload broke".
 */
export function classifyUploadError(
  message: string | undefined,
  status?: number | string
): UploadErrorCode {
  const text = (message || "").toLowerCase();
  const statusCode = Number(status);

  if (
    statusCode === 413 ||
    text.includes("maximum allowed size") ||
    text.includes("too large") ||
    text.includes("payload")
  ) {
    return "FILE_TOO_LARGE";
  }

  if (
    statusCode === 507 ||
    text.includes("insufficient storage") ||
    text.includes("storage quota") ||
    text.includes("exceeded its storage") ||
    text.includes("quota")
  ) {
    return "STORAGE_FULL";
  }

  if (
    statusCode === 415 ||
    text.includes("mime type") ||
    text.includes("not supported") ||
    text.includes("invalid file type")
  ) {
    return "UNSUPPORTED_FILE";
  }

  return "UPLOAD_FAILED";
}

/** The copy shown for each upload failure, plus whether writing is an option. */
export function uploadErrorCopy(code: UploadErrorCode): {
  message: string;
  canSwitchToWritten: boolean;
} {
  switch (code) {
    case "FILE_TOO_LARGE":
      return {
        message:
          "That attachment is larger than the upload limit, so it wasn't saved. Your title and text are still here.",
        canSwitchToWritten: true,
      };
    case "STORAGE_FULL":
      return {
        message:
          "File storage is full, so the attachment couldn't be saved. Your title and text are still here.",
        canSwitchToWritten: true,
      };
    case "UNSUPPORTED_FILE":
      return {
        message:
          "That file type isn't accepted, so the attachment wasn't saved. Your title and text are still here.",
        canSwitchToWritten: true,
      };
    default:
      return {
        message:
          "The attachment couldn't be uploaded. Your title and text are still here — you can retry, or submit it as a Written Output.",
        canSwitchToWritten: true,
      };
  }
}
