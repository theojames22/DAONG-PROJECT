"use client";

import { CheckCircle2, Clock, ShieldCheck, Sun } from "lucide-react";

export interface StaffTopMetricsCardsProps {
  isClockedIn: boolean;
  hoursToday?: number;
  hoursThisWeek: number;
  requiredWeeklyHours: number;
  creditedHours: number;
  standbyHours?: number;
  overtimeHours?: number;
}

export default function StaffTopMetricsCards({
  isClockedIn,
  hoursToday = 0,
  hoursThisWeek,
  requiredWeeklyHours,
  creditedHours,
  standbyHours = 0,
  overtimeHours,
}: StaffTopMetricsCardsProps) {
  // Hours target
  const hoursTarget = requiredWeeklyHours > 0 ? requiredWeeklyHours : 40;
  const hoursLoggedPercent = Math.min(
    Math.round((hoursThisWeek / hoursTarget) * 100),
    100
  );
  const coreShift = Math.min(hoursThisWeek, hoursTarget);
  const overtime =
    overtimeHours !== undefined
      ? overtimeHours
      : Math.max(0, hoursThisWeek - hoursTarget);

  // Credited target
  const creditedTarget = requiredWeeklyHours > 0 ? requiredWeeklyHours : 40;
  const creditedPercent = Math.min(
    Math.round((creditedHours / creditedTarget) * 100),
    100
  );
  const creditedRemaining = Math.max(0, creditedTarget - creditedHours);

  // SVG circular progress parameters (r=20 -> circumference = 2 * PI * 20 = 125.7)
  const circumference = 125.7;
  const ringOffset = circumference - (circumference * hoursLoggedPercent) / 100;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full enter-up enter-d1">
      {/* ===================================================================
          CARD 1: Today — Solid Blue when Clocked In, White when Not
          Informational only, no clock-in button.
          =================================================================== */}
      <div
        className={`card-lift relative flex flex-col justify-between rounded-[20px] p-5 transition-all duration-300 shadow-[0_1px_2px_rgba(15,27,61,.04),0_10px_30px_rgba(37,99,235,.06)] min-h-[170px] ${
          isClockedIn
            ? "bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 text-white border border-blue-500 shadow-md shadow-blue-500/20"
            : "bg-white border border-staff-border text-staff-ink"
        }`}
      >
        {/* Subtle decorative concentric arc pattern on active card */}
        {isClockedIn && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[20px]">
            <svg
              className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 opacity-15"
              viewBox="0 0 100 100"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="20" stroke="white" strokeWidth="2" />
              <circle cx="50" cy="50" r="35" stroke="white" strokeWidth="2" />
              <circle cx="50" cy="50" r="50" stroke="white" strokeWidth="2" />
            </svg>
          </div>
        )}

        {/* Top Header Row */}
        <div className="relative flex items-center justify-between">
          <span
            className={`text-xs font-bold ${
              isClockedIn ? "text-blue-50" : "text-staff-body"
            }`}
          >
            Today
          </span>

          {isClockedIn ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-0.5 text-xs font-semibold text-white border border-white/25 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Clocked in
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-staff-border">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Not clocked in
            </span>
          )}
        </div>

        {/* Middle State Figure */}
        <div className="relative my-2.5">
          {isClockedIn ? (
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-white">
                Active on shift
              </p>
              <p className="mt-1 text-xs text-blue-50 font-medium">
                {hoursToday > 0
                  ? `${hoursToday.toFixed(1)}h recorded so far today`
                  : "Attendance is recording for today"}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-staff-ink">
                Not on shift
              </p>
              <p className="mt-1 text-xs text-staff-body font-medium">
                No attendance recorded yet today
              </p>
            </div>
          )}
        </div>

        {/* Informational Footer Line */}
        <div className="relative pt-2 border-t border-black/5 dark:border-white/10">
          <p
            className={`text-[11px] font-medium leading-tight ${
              isClockedIn ? "text-blue-50" : "text-staff-body"
            }`}
          >
            {isClockedIn
              ? "You can submit work once your session is saved."
              : "Scan your badge with supervisor to record time."}
          </p>
        </div>
      </div>

      {/* ===================================================================
          CARD 2: Hours this week — Progress Ring, core/standby/OT split
          =================================================================== */}
      <div className="card-lift relative flex flex-col justify-between rounded-[20px] border border-staff-border bg-white p-5 shadow-[0_1px_2px_rgba(15,27,61,.04),0_10px_30px_rgba(37,99,235,.06)] min-h-[170px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-staff-body">
            Hours this week
          </span>
          <span className="inline-flex items-center rounded-full bg-staff-soft px-2 py-0.5 text-xs font-bold text-staff-blue-ink">
            {hoursLoggedPercent}% logged
          </span>
        </div>

        {/* Middle: Progress Ring + Hours summary */}
        <div className="my-2.5 flex items-center gap-3.5">
          {/* Progress Ring */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            <svg className="h-14 w-14 -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="20"
                className="stroke-blue-100"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="28"
                cy="28"
                r="20"
                className="stroke-staff-blue transition-all duration-700 ease-out"
                strokeWidth="4"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[11px] font-extrabold text-staff-ink">
              {hoursLoggedPercent}%
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tracking-tight text-staff-ink">
                {hoursThisWeek.toFixed(1)}
              </span>
              <span className="text-sm font-semibold text-staff-body">
                / {hoursTarget.toFixed(1)}h
              </span>
            </div>
            <p className="text-[11px] font-medium text-staff-body mt-0.5">
              Recorded this week
            </p>
          </div>
        </div>

        {/* Bottom split: Core shift, Standby, Overtime in sentence case */}
        <div className="grid grid-cols-3 divide-x divide-staff-border border-t border-staff-border pt-2 text-center">
          <div className="px-1">
            <p className="text-[10px] font-semibold text-staff-body">Core shift</p>
            <p className="mt-0.5 text-xs font-bold text-staff-ink">
              {coreShift.toFixed(1)}h
            </p>
          </div>
          <div className="px-1">
            <p className="text-[10px] font-semibold text-staff-body">Standby</p>
            <p className="mt-0.5 text-xs font-bold text-staff-ink">
              {standbyHours.toFixed(1)}h
            </p>
          </div>
          <div className="px-1">
            <p className="text-[10px] font-semibold text-staff-body">Overtime</p>
            <p className="mt-0.5 text-xs font-bold text-staff-ink">
              {overtime.toFixed(1)}h
            </p>
          </div>
        </div>
      </div>

      {/* ===================================================================
          CARD 3: Credited hours — Progress bar, % met, remaining, info line
          =================================================================== */}
      <div className="card-lift relative flex flex-col justify-between rounded-[20px] border border-staff-border bg-white p-5 shadow-[0_1px_2px_rgba(15,27,61,.04),0_10px_30px_rgba(37,99,235,.06)] min-h-[170px] sm:col-span-2 lg:col-span-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-staff-body">
            Credited hours
          </span>
          <span className="inline-flex items-center rounded-full bg-staff-success-soft px-2 py-0.5 text-xs font-bold text-staff-success">
            {creditedPercent}% met
          </span>
        </div>

        {/* Middle: Numbers & Progress bar */}
        <div className="my-2.5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tracking-tight text-staff-ink">
                {creditedHours.toFixed(1)}
              </span>
              <span className="text-sm font-semibold text-staff-body">
                / {creditedTarget.toFixed(1)}h
              </span>
            </div>
            <span className="text-xs font-bold text-staff-body">
              {creditedRemaining > 0
                ? `${creditedRemaining.toFixed(1)}h remaining`
                : "Target met"}
            </span>
          </div>

          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out"
              style={{ width: `${creditedPercent}%` }}
            />
          </div>
        </div>

        {/* Short info line as requested: "Hours count only on days with an approved output." */}
        <div className="border-t border-staff-border pt-2">
          <p className="text-[11px] leading-tight text-staff-body">
            Hours count only on days with an approved output.
          </p>
        </div>
      </div>
    </div>
  );
}
