import type { OutputStatus } from "@/lib/types";
import { STATUS_META } from "./my-outputs-ui";

/**
 * Status pill for My Outputs.
 *
 * The page keeps its own badge instead of reusing `OutputStatusPill` because
 * the staff-facing vocabulary here is Pending / Checking / Approved / Rejected
 * (the stored `done` status is displayed as "Approved"). Colours come from the
 * page-scoped tokens, so the same pill re-themes in dark mode, and the word is
 * always present — colour is never the only signal.
 */
export default function StatusBadge({
  status,
  className = "",
}: {
  status: OutputStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold leading-none transition-colors duration-200 ${className}`}
      style={{ background: meta.badgeBg, color: meta.badgeFg }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: meta.dot }}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}
