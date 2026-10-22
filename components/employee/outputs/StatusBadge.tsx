import type { OutputStatus } from "@/lib/types";
import { STATUS_META } from "./my-outputs-ui";

/**
 * Status pill for My Outputs.
 *
 * The page keeps its own badge instead of reusing `OutputStatusPill` because
 * the staff-facing vocabulary here is Pending / Checking / Approved / Rejected
 * (the stored `done` status is displayed as "Approved"), and the colour order
 * matches this page's brief. The word is always present — colour is never the
 * only signal.
 */
export default function StatusBadge({
  status,
  className = "",
}: {
  status: OutputStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? {
    label: String(status),
    badge: "bg-staff-chip text-staff-body",
    dot: "bg-staff-muted",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold leading-none transition-colors duration-200 ${meta.badge} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}
