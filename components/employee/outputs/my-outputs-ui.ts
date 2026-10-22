/**
 * My Outputs — page-scoped vocabulary and formatting.
 *
 * Nothing here touches the database. It exists so the card, the list row and
 * the details drawer all describe a submission the same way, and so the
 * staff-facing vocabulary lives in exactly one place.
 *
 * Vocabulary mapping (display only — the stored statuses are unchanged):
 *   pending  → "Pending"
 *   checking → "Checking"
 *   done     → "Approved"   (the Head workflow calls this "approved")
 *   rejected → "Rejected"
 */

import {
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  PenLine,
  XCircle,
} from "lucide-react";
import { toDateKey } from "@/lib/attendance";
import { formatFileSize, isSafeHttpUrl } from "@/lib/outputs";
import type { AttachmentType, Output, OutputStatus } from "@/lib/types";

/** Cards per page in both views. Small enough to stay scannable on mobile. */
export const PAGE_SIZE = 9;

export type ViewMode = "card" | "list";
export type SortMode = "newest" | "oldest";
export type StatusFilter = OutputStatus | "all";
export type TypeFilter = AttachmentType | "all";

/** Loading state of a written body fetched on demand. */
export type PreviewState = "idle" | "loading" | "ready" | "error";

export interface OutputCounts {
  total: number;
  pending: number;
  checking: number;
  approved: number;
  rejected: number;
}

export interface StatusMeta {
  label: string;
  /** Pale background + readable text — never colour alone. */
  badge: string;
  dot: string;
  icon: typeof Clock3;
  /** One-line explanation used on the summary cards. */
  summary: string;
}

export const STATUS_META: Record<OutputStatus, StatusMeta> = {
  pending: {
    label: "Pending",
    badge: "bg-staff-warning-soft text-staff-warning",
    dot: "bg-amber-500",
    icon: Clock3,
    summary: "Awaiting review",
  },
  checking: {
    label: "Checking",
    badge: "bg-staff-soft text-staff-blue-ink",
    dot: "bg-blue-500",
    icon: Eye,
    summary: "Being reviewed now",
  },
  done: {
    label: "Approved",
    badge: "bg-staff-success-soft text-staff-success",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    summary: "Approved work",
  },
  rejected: {
    label: "Rejected",
    badge: "bg-staff-danger-soft text-staff-danger",
    dot: "bg-red-500",
    icon: XCircle,
    summary: "Changes requested",
  },
};

export interface TypeMeta {
  label: string;
  icon: typeof FileText;
  /** Icon container tint. Type is communicated by the icon, not by colour alone. */
  tile: string;
}

export const TYPE_META: Record<AttachmentType, TypeMeta> = {
  written: {
    label: "Written Output",
    icon: PenLine,
    tile: "bg-staff-soft text-staff-blue-ink",
  },
  file: { label: "File", icon: FileText, tile: "bg-staff-chip text-staff-body" },
  image: {
    label: "Image",
    icon: ImageIcon,
    tile: "bg-staff-chip text-staff-body",
  },
  link: { label: "Link", icon: LinkIcon, tile: "bg-staff-chip text-staff-body" },
};

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "checking", label: "Checking" },
  { value: "done", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "written", label: "Written Output" },
  { value: "file", label: "File" },
  { value: "image", label: "Image" },
  { value: "link", label: "Link" },
];

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

/** Counts are derived from real rows; no bucket is invented. */
export function countOutputs(rows: Pick<Output, "status">[]): OutputCounts {
  const counts: OutputCounts = {
    total: rows.length,
    pending: 0,
    checking: 0,
    approved: 0,
    rejected: 0,
  };

  for (const row of rows) {
    if (row.status === "pending") counts.pending += 1;
    else if (row.status === "checking") counts.checking += 1;
    else if (row.status === "done") counts.approved += 1;
    else if (row.status === "rejected") counts.rejected += 1;
  }

  return counts;
}

/**
 * The Head's note, shown as feedback.
 *
 * `reviewer_notes` is only reported once the submission has left "pending":
 * legacy rows used that column for the staff member's own note, so a pending
 * row is never allowed to advertise feedback that does not exist.
 */
export function hasFeedback(row: Pick<Output, "status" | "reviewer_notes">): boolean {
  if (row.status === "pending") return false;
  return typeof row.reviewer_notes === "string" && row.reviewer_notes.trim().length > 0;
}

/** A timestamptz rendered in the viewer's locale. */
export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A bare YYYY-MM-DD date key (outputs.date) is parsed as LOCAL midnight so
 * the calendar day shown matches the day the submission belongs to.
 */
export function formatWorkDate(value?: string | null): string {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateTime(value);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Compact date for cards: "Oct 22, 2026". Falls back to the work date. */
export function formatCardDate(row: Pick<Output, "created_at" | "date">): string {
  const source = row.created_at ?? row.date;
  if (!source) return "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? new Date(`${source}T00:00:00`)
    : new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Submission date AND time for a collection entry: "Oct 22, 2026, 3:42 PM".
 * Rows without a timestamp fall back to the work date alone.
 */
export function formatSubmittedStamp(
  row: Pick<Output, "created_at" | "date">
): string {
  const source = row.created_at ?? row.date;
  if (!source) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return formatCardDate(row);

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Date only, for the "Reviewed …" line. */
export function formatShortDate(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "figma.com/file/abc" — readable, and never wider than `max`. */
export function shortenUrl(url: string, max = 48): string {
  if (!url) return "";
  let display = url;
  try {
    const parsed = new URL(url);
    const rest = `${parsed.pathname}${parsed.search}`;
    display = `${parsed.host}${rest === "/" ? "" : rest}`;
  } catch {
    // Not parseable — fall through and truncate the raw string.
  }
  if (display.length <= max) return display;
  return `${display.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * The URL a submission is displayed/downloaded from.
 *
 * Prefers the stored URL (only when it is a safe http(s) value — a legacy row
 * could hold something else). If the row has a storage path but no URL, the
 * public object URL is reconstructed from the same `project-files` bucket the
 * upload route writes to, so a row whose URL was lost is still reachable.
 */
export function attachmentUrl(
  row: Pick<Output, "attachment_url" | "storage_path">
): string | null {
  if (row.attachment_url && isSafeHttpUrl(row.attachment_url)) {
    return row.attachment_url;
  }

  if (row.storage_path) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
    if (!base) return null;
    const path = row.storage_path
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    if (!path) return null;
    return `${base}/storage/v1/object/public/project-files/${path}`;
  }

  return null;
}

/**
 * Adds Supabase Storage's `?download=` flag so a cross-origin file is served
 * with an attachment disposition instead of opening in a tab. The `download`
 * attribute is ignored cross-origin, this is the mechanism that works.
 */
export function downloadUrl(url: string, fileName: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("download", fileName);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** "1.2 MB" — or null when the size was never recorded. */
export function fileSizeLabel(row: Pick<Output, "file_size">): string | null {
  return typeof row.file_size === "number" && row.file_size > 0
    ? formatFileSize(row.file_size)
    : null;
}

/** One-line description used by the list view. */
export function submissionSubtitle(row: Output): string {
  switch (row.attachment_type) {
    case "written":
      return row.submission_notes?.trim() || "Written output";
    case "file":
      return row.file_name || "File attachment";
    case "image":
      return row.file_name || "Image attachment";
    case "link":
      return row.attachment_url ? shortenUrl(row.attachment_url, 60) : "Link unavailable";
    default:
      return "Submission";
  }
}

/** Case-insensitive search over the details that are actually in the list payload. */
export function matchesSearch(row: Output, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    row.title,
    row.file_name,
    row.submission_notes,
    row.reviewer_notes,
    row.attachment_type === "link" ? row.attachment_url : null,
  ];

  return haystack.some(
    (value) =>
      typeof value === "string" && value.toLowerCase().includes(needle)
  );
}

/**
 * Date range over the submission timestamp.
 *
 * Compares local YYYY-MM-DD keys, so a submission at 11pm local time filters
 * by the day the staff member experienced, not by UTC.
 */
export function matchesRange(row: Output, from: string, to: string): boolean {
  if (!from && !to) return true;
  const key = row.created_at ? toDateKey(row.created_at) : row.date;
  if (!key) return true;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/** Newest/oldest by submission time; stable for rows without a timestamp. */
export function sortOutputs(rows: Output[], mode: SortMode): Output[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return mode === "newest" ? bTime - aTime : aTime - bTime;
  });
  return copy;
}

/** Page numbers with "gap" markers, e.g. [1, gap, 4, 5, 6, gap, 20]. */
export function pageWindow(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const wanted = new Set<number>([
    1,
    total,
    current,
    current - 1,
    current + 1,
  ]);
  const pages = [...wanted]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const output: Array<number | "gap"> = [];
  let previous = 0;
  for (const page of pages) {
    if (previous && page - previous > 1) output.push("gap");
    output.push(page);
    previous = page;
  }
  return output;
}
