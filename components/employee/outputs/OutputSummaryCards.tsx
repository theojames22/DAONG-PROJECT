"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import type { OutputCounts, StatusFilter } from "./my-outputs-ui";
import {
  STATUS_META,
  approvalRate,
  formatRelativeTime,
} from "./my-outputs-ui";

interface OutputSummaryCardsProps {
  counts: OutputCounts;
  activeStatus: StatusFilter;
  onSelectStatus: (status: StatusFilter) => void;
  latestAt: number | null;
  /** A failed query must never be rendered as a row of zeros. */
  unavailable?: boolean;
}

interface Tile {
  status: "pending" | "checking" | "done" | "rejected";
  countKey: "pending" | "checking" | "approved" | "rejected";
  icon: LucideIcon;
  onClass: string;
}

const TILES: Tile[] = [
  { status: "pending", countKey: "pending", icon: Clock3, onClass: styles.tileOnPending },
  { status: "checking", countKey: "checking", icon: Eye, onClass: styles.tileOnChecking },
  { status: "done", countKey: "approved", icon: CheckCircle2, onClass: styles.tileOnApproved },
  { status: "rejected", countKey: "rejected", icon: XCircle, onClass: styles.tileOnRejected },
];

/**
 * The summary is the dashboard's primary navigation as well as its overview:
 * "Total" clears the status filter, and each pipeline tile toggles that stage.
 * Counts are server-side facts for the whole collection, never the visible page.
 */
export default function OutputSummaryCards({
  counts,
  activeStatus,
  onSelectStatus,
  latestAt,
  unavailable = false,
}: OutputSummaryCardsProps) {
  // Rendered only after mount so the server and client markup agree, then
  // refreshed once a minute without re-rendering the rest of the page.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const rate = approvalRate(counts);

  let rateCopy = "Nothing submitted yet";
  if (unavailable) {
    rateCopy = "Counts unavailable";
  } else if (counts.total > 0) {
    const base = rate === null ? "Nothing reviewed yet" : `${rate}% approved`;
    rateCopy =
      latestAt && now
        ? `${base} · latest ${formatRelativeTime(latestAt, now)}`
        : base;
  }

  const barAria = unavailable
    ? "Submission status distribution unavailable"
    : counts.total === 0
      ? "No submissions to distribute"
      : `Status distribution: ${counts.pending} pending, ${counts.checking} checking, ${counts.approved} approved, ${counts.rejected} rejected.`;

  return (
    <section
      aria-label="Submission summary"
      className={`${styles.enter} ${styles.summaryShell}`}
      style={{ "--mo-delay": "60ms" } as CSSProperties}
    >
      <button
        type="button"
        onClick={() => onSelectStatus("all")}
        aria-pressed={activeStatus === "all"}
        aria-label={`Total submissions: ${unavailable ? "unavailable" : counts.total}. Show all outputs.`}
        className={styles.totalCard}
      >
        <span className={styles.totalLabel}>Total submissions</span>
        <span key={counts.total} className={`${styles.totalCount} ${styles.pop}`}>
          {unavailable ? "—" : counts.total}
        </span>
        <span className={styles.totalSub}>Everything you&apos;ve sent</span>
        <span className={styles.totalRate}>{rateCopy}</span>
      </button>

      <div className="flex min-w-0 flex-[3_1_640px] flex-col justify-center gap-[18px] px-2.5 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className={styles.pipeTitle}>Review pipeline</h2>
          <span className={styles.pipeNote}>
            Select a stage to filter your outputs
          </span>
        </div>

        <div className={styles.bar} role="img" aria-label={barAria}>
          {unavailable || counts.total === 0 ? (
            <span
              className={styles.barSeg}
              style={{ flexGrow: 1, background: "var(--mo-border)" }}
              aria-hidden="true"
            />
          ) : (
            TILES.map((tile) => {
              const value = counts[tile.countKey];
              const meta = STATUS_META[tile.status];
              return (
                <span
                  key={tile.status}
                  className={styles.barSeg}
                  style={{
                    display: value > 0 ? "block" : "none",
                    flexGrow: value,
                    background: meta.bar,
                  }}
                  aria-hidden="true"
                />
              );
            })
          )}
        </div>

        <div className={styles.tileGrid}>
          {TILES.map((tile) => {
            const meta = STATUS_META[tile.status];
            const Icon = tile.icon;
            const value = counts[tile.countKey];
            const active = activeStatus === tile.status;

            return (
              <button
                key={tile.status}
                type="button"
                onClick={() =>
                  onSelectStatus(active ? "all" : tile.status)
                }
                aria-pressed={active}
                aria-label={`${meta.label}: ${
                  unavailable ? "unavailable" : value
                } submission${value === 1 ? "" : "s"}. ${
                  active ? "Showing this stage." : "Filter to this stage."
                }`}
                className={`${styles.tile} ${active ? tile.onClass : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={styles.tileLabel}>{meta.label}</span>
                  <span
                    className={styles.tileIcon}
                    style={{ background: meta.badgeBg, color: meta.badgeFg }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </span>
                </span>
                <span
                  key={value}
                  className={`${styles.tileCount} ${styles.pop}`}
                  style={{ color: meta.badgeFg }}
                >
                  {unavailable ? "—" : value}
                </span>
                <span className={styles.tileSub}>{meta.summary}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
