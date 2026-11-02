"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Trophy, X } from "lucide-react";
import { Profile } from "@/lib/types";
import { creditedPercent, formatHours, formatPercent } from "@/lib/attendance";
import ModalShell from "@/components/shared/ModalShell";
import styles from "@/app/head/workforce/workforce.module.css";

/** Default number of ranked employees shown before the full list is opened. */
const DEFAULT_VISIBLE = 3;

export interface WeeklyLeaderboardProps {
  employees: Profile[];
  creditedByEmployee: Record<string, number>;
  recordedByEmployee: Record<string, number>;
  activeEmployeeIds: string[];
  weekStart: string;
  weekEnd: string;
}

interface LeaderboardRowProps {
  employee: Profile;
  rank: number;
  credited: number;
  recorded: number;
  required: number;
  isClockedIn: boolean;
}

/**
 * One ranked employee. Kept in a single component so the compact top-three
 * list and the full leaderboard modal always render identical data,
 * alignment and progress bars.
 */
function LeaderboardRow({
  employee,
  rank,
  credited,
  recorded,
  required,
  isClockedIn,
}: LeaderboardRowProps) {
  const pct = creditedPercent(credited, required);
  const shortHours = Math.max(0, required - credited);
  const initial = (employee.full_name || "E").charAt(0).toUpperCase();

  return (
    <div
      className={`flex min-h-[64px] flex-wrap items-center gap-3 rounded-xl px-2.5 py-2 sm:flex-nowrap sm:gap-4 sm:px-3 ${styles.lbRow}`}
    >
      {/* Rank badge */}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          rank === 1
            ? "bg-blue-600 text-white shadow-sm"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {rank}
      </span>

      {/* Avatar */}
      <div className="relative shrink-0">
        {employee.profile_picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={employee.profile_picture_url}
            alt={employee.full_name || "Avatar"}
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
          {employee.full_name || "Unnamed"}
        </p>
        <p className="truncate text-xs font-medium capitalize text-slate-400">
          {employee.position || employee.role || "Employee"}
        </p>
      </div>

      {/* Progress Bar & Stats */}
      <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-semibold text-slate-700">
            {formatHours(credited)} credited / {formatHours(required)}
          </span>
          <span className="shrink-0 font-bold text-blue-600">
            {formatPercent(pct)}
          </span>
        </div>

        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-blue-600 ${styles.barFill}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <span className="text-[10.5px] font-medium text-slate-400">
          {formatHours(recorded)} recorded
        </span>
      </div>

      {/* Warning Badge / Remaining Hours */}
      <div className="shrink-0 pl-1">
        {shortHours > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Short {formatHours(shortHours)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Target Met
          </span>
        )}
      </div>
    </div>
  );
}

export default function WeeklyLeaderboard({
  employees,
  creditedByEmployee,
  recordedByEmployee,
  activeEmployeeIds,
  weekStart,
  weekEnd,
}: WeeklyLeaderboardProps) {
  const [showFull, setShowFull] = useState(false);
  const activeSet = useMemo(() => new Set(activeEmployeeIds), [activeEmployeeIds]);

  // Only Staff carry an attendance requirement; Heads are administrators
  // and are excluded from the attendance ranking.
  const eligibleEmployees = useMemo(() => {
    return employees.filter((e) => e.role === "staff");
  }, [employees]);

  // Team totals: credited hours drive the target percentage, recorded hours
  // are shown separately as context.
  const { totalCredited, totalRecorded, totalRequired, targetPct } = useMemo(() => {
    const credited = eligibleEmployees.reduce(
      (sum, e) => sum + (creditedByEmployee[e.id] ?? 0),
      0
    );
    const recorded = eligibleEmployees.reduce(
      (sum, e) => sum + (recordedByEmployee[e.id] ?? 0),
      0
    );
    const required = eligibleEmployees.reduce(
      (sum, e) => sum + (e.required_weekly_hours ?? 0),
      0
    );
    const pct = creditedPercent(credited, required);
    return {
      totalCredited: credited,
      totalRecorded: recorded,
      totalRequired: required,
      targetPct: pct,
    };
  }, [eligibleEmployees, creditedByEmployee, recordedByEmployee]);

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

  // Rank employees by credited hours descending
  const rankedEmployees = useMemo(() => {
    return [...eligibleEmployees].sort((a, b) => {
      const hoursA = creditedByEmployee[a.id] ?? 0;
      const hoursB = creditedByEmployee[b.id] ?? 0;
      if (hoursB !== hoursA) return hoursB - hoursA;
      // Tie breakers
      const reqA = a.required_weekly_hours ?? 0;
      const reqB = b.required_weekly_hours ?? 0;
      if (reqB !== reqA) return reqB - reqA;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
  }, [eligibleEmployees, creditedByEmployee]);

  const visibleEmployees = rankedEmployees.slice(0, DEFAULT_VISIBLE);
  const hasMore = rankedEmployees.length > DEFAULT_VISIBLE;

  const renderRow = (emp: Profile, idx: number) => (
    <LeaderboardRow
      key={emp.id}
      employee={emp}
      rank={idx + 1}
      credited={creditedByEmployee[emp.id] ?? 0}
      recorded={recordedByEmployee[emp.id] ?? 0}
      required={emp.required_weekly_hours ?? 0}
      isClockedIn={activeSet.has(emp.id)}
    />
  );

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
                {eligibleEmployees.length} Staff
              </span>
            </div>
          </div>
        </div>

        {/* Right: Employee Leaderboard — top three by default. */}
        <div className="flex flex-col lg:col-span-8 lg:pl-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Ranked by hours this week
            </span>
            <span className="text-xs font-medium text-slate-400">
              Resets every Monday
            </span>
          </div>

          {rankedEmployees.length === 0 ? (
            <div className="py-10 text-center text-xs font-medium text-slate-400">
              No eligible employees logged for attendance yet.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                {visibleEmployees.map(renderRow)}
              </div>

              {hasMore && (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
                  <span className="text-[11px] font-medium text-slate-400">
                    Showing top {DEFAULT_VISIBLE} of {rankedEmployees.length} Staff
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
            </>
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
                Full ranking
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
            <span>
              {rankedEmployees.length} Staff ranked
            </span>
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
            <div className="flex flex-col gap-1.5">
              {rankedEmployees.map(renderRow)}
            </div>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
