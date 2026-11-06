"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Trophy, X } from "lucide-react";
import {
  creditedPercent,
  formatHours,
  formatPercent,
  formatPercentValue,
} from "@/lib/attendance";
import type {
  LeaderboardCandidate,
  RankedLeaderboardEntry,
} from "@/lib/leaderboard";
import ModalShell from "@/components/shared/ModalShell";
import styles from "@/app/head/workforce/workforce.module.css";

/** Default number of ranked employees shown before the full list is opened. */
const DEFAULT_VISIBLE = 3;

export interface WeeklyLeaderboardProps {
  /** Server-ranked by capped completion of each Staff member's own target. */
  entries: RankedLeaderboardEntry[];
  /** Staff with no usable weekly requirement; excluded from the ranking. */
  notApplicable: LeaderboardCandidate[];
  activeEmployeeIds: string[];
  weekStart: string;
  weekEnd: string;
}

interface LeaderboardRowProps {
  entry: RankedLeaderboardEntry;
  isClockedIn: boolean;
}

/**
 * One ranked employee. Kept in a single component so the compact top-three
 * list and the full leaderboard modal always render identical data,
 * alignment and progress bars.
 */
function LeaderboardRow({ entry, isClockedIn }: LeaderboardRowProps) {
  const credited = entry.creditedHours;
  const recorded = entry.recordedHours;
  const required = entry.requiredHours;
  const targetMet = entry.completionPercent >= 100;
  const shortHours = targetMet ? 0 : Math.max(0, required - credited);
  const overTarget = entry.actualPercent > 100;
  const initial = (entry.full_name || "E").charAt(0).toUpperCase();

  return (
    <div
      className={`flex min-h-[68px] flex-wrap items-center gap-3 rounded-xl px-2.5 py-2 sm:flex-nowrap sm:gap-4 sm:px-3 ${styles.lbRow}`}
    >
      {/* Rank badge */}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          entry.rank === 1
            ? "bg-blue-600 text-white shadow-sm"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {entry.rank}
      </span>

      {/* Avatar */}
      <div className="relative shrink-0">
        {entry.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.profile_picture_url}
            alt={entry.full_name || "Avatar"}
            className="h-10 w-10 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-sm">
            {initial}
          </div>
        )}
        {isClockedIn && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white ${styles.liveDot}`}
            title="Active On-Shift"
          />
        )}
      </div>

      {/* Name & Position */}
      <div className="min-w-[100px] shrink-0 sm:w-28">
        <p className="truncate text-sm font-bold text-slate-900">
          {entry.full_name || "Unnamed"}
        </p>
        <p className="truncate text-xs font-medium capitalize text-slate-400">
          {entry.position || "Employee"}
        </p>
      </div>

      {/* Progress Bar & Supporting Hours */}
      <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="truncate font-semibold text-slate-700">
            {formatHours(credited)} credited / {formatHours(required)} required
          </span>
          <span className="shrink-0 font-medium text-slate-400">
            {formatHours(recorded)} recorded
          </span>
        </div>

        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-blue-600 ${styles.barFill}`}
            style={{ width: `${entry.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Completion percentage + indicator */}
      <div className="ml-auto shrink-0 pl-1 text-right">
        <p className="text-xl font-black leading-none tabular-nums text-blue-600">
          {formatPercent(entry.completionPercent)}
        </p>
        {overTarget && (
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
            {formatPercentValue(entry.actualPercent)} actual
          </p>
        )}
        <span
          className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            targetMet
              ? "bg-emerald-50 text-emerald-600"
              : "bg-rose-50 text-rose-600"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              targetMet ? "bg-emerald-500" : "bg-rose-500"
            }`}
          />
          {targetMet ? "Target met" : `Short ${formatHours(shortHours)}`}
        </span>
      </div>
    </div>
  );
}

export default function WeeklyLeaderboard({
  entries,
  notApplicable,
  activeEmployeeIds,
  weekStart,
  weekEnd,
}: WeeklyLeaderboardProps) {
  const [showFull, setShowFull] = useState(false);
  const activeSet = useMemo(() => new Set(activeEmployeeIds), [activeEmployeeIds]);

  // Team totals use the ranked (applicable) Staff for credited/required, while
  // recorded hours include everyone so uncredited work is still visible.
  const { totalCredited, totalRecorded, totalRequired, targetPct } = useMemo(() => {
    const credited = entries.reduce((sum, entry) => sum + entry.creditedHours, 0);
    const recorded = [...entries, ...notApplicable].reduce(
      (sum, entry) => sum + entry.recordedHours,
      0
    );
    const required = entries.reduce((sum, entry) => sum + entry.requiredHours, 0);
    return {
      totalCredited: credited,
      totalRecorded: recorded,
      totalRequired: required,
      targetPct: creditedPercent(credited, required),
    };
  }, [entries, notApplicable]);

  // Format week date range: e.g. "Oct 12 – Oct 18"
  const dateRangeStr = useMemo(() => {
    if (!weekStart || !weekEnd) return "";
    try {
      const s = new Date(`${weekStart}T00:00:00`);
      const e = new Date(`${weekEnd}T00:00:00`);
      const startFormatted = s.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const endFormatted = e.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return `${startFormatted} – ${endFormatted}`;
    } catch {
      return `${weekStart} – ${weekEnd}`;
    }
  }, [weekStart, weekEnd]);

  // `entries` is already sorted and ranked on the server. Slice only for the
  // compact card; the full modal renders the exact same ordered array.
  const visibleEntries = entries.slice(0, DEFAULT_VISIBLE);
  const hasMore = entries.length > DEFAULT_VISIBLE;
  const canOpenFull = hasMore || notApplicable.length > 0;

  const renderRow = (entry: RankedLeaderboardEntry) => (
    <LeaderboardRow
      key={entry.id}
      entry={entry}
      isClockedIn={activeSet.has(entry.id)}
    />
  );

  const notApplicableNames = notApplicable
    .map((entry) => entry.full_name || "Unnamed")
    .join(", ");

  return (
    <div className="w-full rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all sm:p-7">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Left: Weekly Summary Card — content-sized, never stretched to the
            height of the ranked list. */}
        <div className="relative flex flex-col overflow-hidden rounded-2xl border border-blue-100/60 bg-[#f0f6ff] p-5 sm:p-6 lg:col-span-4 lg:self-start">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
                Weekly Leaderboard
              </span>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {dateRangeStr}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Trophy className="h-5 w-5" strokeWidth={2.3} />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-4xl font-black tracking-tight text-slate-900 sm:text-[44px]">
              {formatHours(totalCredited)}
            </p>
            <p className="mt-1.5 text-xs font-medium text-slate-500 sm:text-[13px]">
              credited of {formatHours(totalRequired)} required by the team
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-400">
              {formatHours(totalRecorded)} recorded this week
            </p>
          </div>

          <div className="mt-5">
            {/* Progress track & bar */}
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-blue-200/60">
              <div
                className={`h-full rounded-full bg-blue-600 ${styles.barFill}`}
                style={{ width: `${targetPct}%` }}
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-blue-600">
                {formatPercent(targetPct)} of target
              </span>
              <span className="font-medium text-slate-400">
                {entries.length} Staff ranked
              </span>
            </div>
          </div>
        </div>

        {/* Right: Employee Leaderboard — top three by default. */}
        <div className="flex flex-col lg:col-span-8 lg:pl-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Ranked by completion this week
            </span>
            <span className="text-xs font-medium text-slate-400">
              Resets every Monday
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="py-10 text-center text-xs font-medium text-slate-400">
              No Staff with a weekly requirement to rank.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visibleEntries.map(renderRow)}
            </div>
          )}

          {canOpenFull && (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
              <span className="text-[11px] font-medium text-slate-400">
                {hasMore
                  ? `Showing top ${DEFAULT_VISIBLE} of ${entries.length} Staff`
                  : `${notApplicable.length} Staff not applicable`}
              </span>
              <button
                type="button"
                onClick={() => setShowFull(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50"
              >
                See full leaderboard
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          )}

          {notApplicable.length > 0 && (
            <p className="mt-2 text-[10px] font-medium leading-relaxed text-slate-400">
              Not Applicable — no weekly requirement: {notApplicableNames}
            </p>
          )}
        </div>
      </div>

      {/* Full ranking — contained in a modal so the page itself never grows
          with the number of employees. The list scrolls internally. */}
      <ModalShell
        open={showFull}
        onClose={() => setShowFull(false)}
        maxWidthClass="max-w-2xl"
        ariaLabelledBy="full-leaderboard-title"
      >
        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
                Weekly Leaderboard
              </p>
              <h2
                id="full-leaderboard-title"
                className="mt-0.5 text-lg font-bold text-slate-900"
              >
                Full ranking by completion
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                {dateRangeStr} · Resets every Monday
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFull(false)}
              aria-label="Close full leaderboard"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[11px] font-medium text-slate-500 sm:px-6">
            <span>{entries.length} Staff ranked</span>
            <span>
              {formatHours(totalCredited)} credited of{" "}
              {formatHours(totalRequired)} required
            </span>
          </div>

          <div
            role="region"
            aria-label="Full weekly leaderboard"
            tabIndex={0}
            className="min-h-0 max-h-[60vh] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 sm:px-3"
          >
            {entries.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {entries.map(renderRow)}
              </div>
            )}

            {notApplicable.length > 0 && (
              <div className="mx-1 mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 sm:mx-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Not Applicable — no weekly requirement
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {notApplicable.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate font-semibold text-slate-600">
                        {entry.full_name || "Unnamed"}
                      </span>
                      <span className="shrink-0 text-[10.5px] font-medium text-slate-400">
                        {formatHours(entry.creditedHours)} credited ·{" "}
                        {formatHours(entry.recordedHours)} recorded
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
