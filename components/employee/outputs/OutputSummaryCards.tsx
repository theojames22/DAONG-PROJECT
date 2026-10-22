import type { CSSProperties } from "react";
import { CheckCircle2, Clock3, Eye, LayoutGrid, XCircle } from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import type { OutputCounts } from "./my-outputs-ui";

interface SummaryCard {
  key: keyof OutputCounts;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
  tint: string;
}

/**
 * Order is deliberate: totals first, then the review lifecycle in the same
 * order a submission moves through it.
 */
const CARDS: SummaryCard[] = [
  {
    key: "total",
    label: "Total Submissions",
    description: "Everything you've sent",
    icon: LayoutGrid,
    tint: "bg-blue-50 text-blue-600",
  },
  {
    key: "pending",
    label: "Pending",
    description: "Awaiting review",
    icon: Clock3,
    tint: "bg-amber-50 text-amber-600",
  },
  {
    key: "checking",
    label: "Checking",
    description: "Being reviewed now",
    icon: Eye,
    tint: "bg-blue-50 text-blue-600",
  },
  {
    key: "approved",
    label: "Approved",
    description: "Approved work",
    icon: CheckCircle2,
    tint: "bg-emerald-50 text-emerald-600",
  },
  {
    key: "rejected",
    label: "Rejected",
    description: "Changes requested",
    icon: XCircle,
    tint: "bg-red-50 text-red-600",
  },
];

/**
 * Stats are supplied by the server page from an exact count query — never
 * computed from the currently visible page of rows, and never shown as zeros
 * when the request failed (the page renders its error panel instead).
 */
export default function OutputSummaryCards({ counts }: { counts: OutputCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {CARDS.map((card, index) => {
        const Icon = card.icon;
        const value = counts[card.key];

        return (
          <div
            key={card.key}
            className={`${styles.enter} ${styles.statCard} flex items-center gap-3 rounded-2xl border border-staff-border bg-white p-4 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.05)]`}
            style={{ "--mo-delay": `${index * 50}ms` } as CSSProperties}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-staff-muted">
                {card.label}
              </p>
              {/* Keyed so a real count change fades in without moving the card. */}
              <p
                key={value}
                className={`${styles.countPop} text-xl font-extrabold leading-tight text-staff-ink tabular-nums`}
              >
                {value}
              </p>
              <p className="hidden truncate text-[10.5px] text-staff-body sm:block">
                {card.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
