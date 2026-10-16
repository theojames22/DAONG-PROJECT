"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Profile } from "@/lib/types";
import { creditedPercent, formatHours, formatPercent } from "@/lib/attendance";
import styles from "@/app/head/workforce/workforce.module.css";

export interface WeeklyLeaderboardProps {
  employees: Profile[];
  creditedByEmployee: Record<string, number>;
  activeEmployeeIds: string[];
  weekStart: string;
  weekEnd: string;
}

export default function WeeklyLeaderboard({
  employees,
  creditedByEmployee,
  activeEmployeeIds,
  weekStart,
  weekEnd,
}: WeeklyLeaderboardProps) {
  const activeSet = useMemo(() => new Set(activeEmployeeIds), [activeEmployeeIds]);

  // Only Staff carry an attendance requirement; Heads are administrators
  // and are excluded from the attendance ranking.
  const eligibleEmployees = useMemo(() => {
    return employees.filter((e) => e.role === "staff");
  }, [employees]);

  // Calculate team total logged and required hours
  const { totalLogged, totalRequired, targetPct } = useMemo(() => {
    const logged = eligibleEmployees.reduce(
      (sum, e) => sum + (creditedByEmployee[e.id] ?? 0),
      0
    );
    const required = eligibleEmployees.reduce(
      (sum, e) => sum + (e.required_weekly_hours ?? 0),
      0
    );
    const pct = creditedPercent(logged, required);
    return {
      totalLogged: logged,
      totalRequired: required,
      targetPct: pct,
    };
  }, [eligibleEmployees, creditedByEmployee]);

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

  return (
    <div className="w-full rounded-3xl border border-slate-100 bg-white p-6 sm:p-7 shadow-sm transition-all">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Weekly Summary Card */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl bg-[#f0f6ff] p-6 border border-blue-100/60 relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600">
                Weekly Leaderboard
              </span>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Trophy className="h-5 w-5" strokeWidth={2.3} />
              </div>
            </div>

            <div className="mt-5">
              <p className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                {formatHours(totalLogged)}
              </p>
              <p className="mt-1.5 text-xs sm:text-[13px] font-medium text-slate-500">
                logged of {formatHours(totalRequired)} required by the team
              </p>
            </div>
          </div>

          <div className="mt-6 pt-2">
            {/* Progress track & bar */}
            <div className="h-2 w-full rounded-full bg-blue-200/60 overflow-hidden relative">
              <div
                className={`h-full rounded-full bg-blue-600 ${styles.barFill}`}
                style={{ width: `${targetPct}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-bold text-blue-600">{formatPercent(targetPct)} of target</span>
              <span className="font-medium text-slate-400">{dateRangeStr}</span>
            </div>
          </div>
        </div>

        {/* Right: Employee Leaderboard */}
        <div className="lg:col-span-8 flex flex-col justify-between pl-0 lg:pl-2">
          <div>
            <div className="flex items-center justify-between pb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                Ranked by hours this week
              </span>
              <span className="text-xs font-medium text-slate-400">Resets every Monday</span>
            </div>

            {rankedEmployees.length === 0 ? (
              <div className="py-10 text-center text-xs font-medium text-slate-400">
                No eligible employees logged for attendance yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 mt-1">
                {rankedEmployees.map((emp, idx) => {
                  const rank = idx + 1;
                  const logged = creditedByEmployee[emp.id] ?? 0;
                  const required = emp.required_weekly_hours ?? 0;
                  const pct = creditedPercent(logged, required);
                  const shortHours = Math.max(0, required - logged);
                  const isClockedIn = activeSet.has(emp.id);
                  const initial = (emp.full_name || "E").charAt(0).toUpperCase();

                  return (
                    <div
                      key={emp.id}
                      className={`flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-xl p-2 sm:p-2.5 ${styles.lbRow}`}
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
                        {emp.profile_picture_url ? (
                          <img
                            src={emp.profile_picture_url}
                            alt={emp.full_name || "Avatar"}
                            className="h-10 w-10 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold shadow-sm">
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
                      <div className="min-w-[100px] sm:w-28 shrink-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {emp.full_name || "Unnamed"}
                        </p>
                        <p className="truncate text-xs font-medium text-slate-400 capitalize">
                          {emp.position || emp.role || "Employee"}
                        </p>
                      </div>

                      {/* Progress Bar & Stats */}
                      <div className="flex-1 min-w-[140px] flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">
                            {formatHours(logged)} / {formatHours(required)}
                          </span>
                          <span className="font-bold text-blue-600">{formatPercent(pct)}</span>
                        </div>

                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden relative">
                          <div
                            className={`h-full rounded-full bg-blue-600 ${styles.barFill}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
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
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
