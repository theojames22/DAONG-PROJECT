"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  toneClass: string;
  onClass: string;
}

const TILES: Tile[] = [
  {
    status: "pending",
    countKey: "pending",
    toneClass: styles.tilePending,
    onClass: styles.tileOnPending,
  },
  {
    status: "checking",
    countKey: "checking",
    toneClass: styles.tileChecking,
    onClass: styles.tileOnChecking,
  },
  {
    status: "done",
    countKey: "approved",
    toneClass: styles.tileApproved,
    onClass: styles.tileOnApproved,
  },
  {
    status: "rejected",
    countKey: "rejected",
    toneClass: styles.tileRejected,
    onClass: styles.tileOnRejected,
  },
];

/**
 * Purely decorative status wave. It has no data points, labels or axis, so it
 * cannot be mistaken for a real completion trend.
 */
function StatusWave() {
  return (
    <svg
      className={styles.tileWave}
      viewBox="0 0 180 96"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 60C22 54 36 32 62 36C88 40 98 70 124 68C150 66 160 44 180 50V96H0V60Z"
        fill="currentColor"
        opacity="0.1"
      />
      <path
        d="M0 60C22 54 36 32 62 36C88 40 98 70 124 68C150 66 160 44 180 50"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M0 80C26 74 42 56 68 60C94 64 106 86 132 80C154 75 164 62 180 68"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

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
                className={`${styles.tile} ${tile.toneClass} ${
                  active ? tile.onClass : ""
                }`}
              >
                <span className={styles.tileTop}>
                  <span className={styles.tileLabel}>{meta.label}</span>
                  <span className={styles.tileDot} aria-hidden="true" />
                </span>

                <span className={styles.tileStat}>
                  <span
                    key={value}
                    className={`${styles.tileCount} ${styles.pop}`}
                  >
                    {unavailable ? "—" : value}
                  </span>
                </span>

                <span className={styles.tileSub}>{meta.summary}</span>
                <StatusWave />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
