"use client";

interface WeeklyQuotaCardProps {
  hoursThisWeek: number;
  requiredWeeklyHours: number;
  /** Hours credited toward the weekly requirement (days with a submitted output). */
  creditedHours: number;
  standbyHours?: number;
  overtimeHours?: number;
}

export default function WeeklyQuotaCard({
  hoursThisWeek,
  requiredWeeklyHours,
  creditedHours,
  standbyHours = 0,
  overtimeHours,
}: WeeklyQuotaCardProps) {
  // --- Attendance hours: raw history, always recorded. ---
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

  // --- Credited hours: the number that counts toward the requirement. ---
  const creditedTarget = requiredWeeklyHours > 0 ? requiredWeeklyHours : 0;
  const creditedPercent =
    creditedTarget > 0
      ? Math.min(Math.round((creditedHours / creditedTarget) * 100), 100)
      : 0;
  const creditedRemaining = Math.max(0, creditedTarget - creditedHours);

  return (
    <div className="neu-raised rounded-neu p-5 flex flex-col gap-5">
      {/* ===== Block 1 — Attendance hours ===== */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
            Attendance Hours
          </span>
          <span className="text-xs font-bold text-accent">
            {hoursLoggedPercent}% Logged
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1 font-display">
            <span className="text-3xl font-bold tracking-tight text-ink">
              {hoursThisWeek.toFixed(1)}
            </span>
            <span className="text-sm font-bold text-ink-subtle">
              / {hoursTarget.toFixed(1)} Hrs
            </span>
          </div>
          <span className="text-xs font-semibold text-ink-muted">
            Recorded this week
          </span>
        </div>

        <div className="elev-pressed mt-3.5 h-2.5 w-full overflow-hidden rounded-full p-0.5">
          <div
            className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
            style={{ width: `${Math.max(hoursLoggedPercent, 0)}%` }}
          />
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-border border-t border-border pt-3 text-center">
          <div>
            <p className="text-[10px] font-semibold text-ink-subtle">Core Shift</p>
            <p className="mt-0.5 text-xs font-bold text-ink">
              {coreShift.toFixed(1)}h
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-ink-subtle">Standby</p>
            <p className="mt-0.5 text-xs font-bold text-ink">
              {standbyHours.toFixed(1)}h
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-ink-subtle">Overtime</p>
            <p className="mt-0.5 text-xs font-bold text-ink">
              {overtime.toFixed(1)}h
            </p>
          </div>
        </div>
      </div>

      {/* ===== Block 2 — Credited hours toward the weekly requirement ===== */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
            Credited Hours
          </span>
          <span className="text-xs font-bold text-accent">
            {creditedPercent}% Met
          </span>
        </div>

        <div className="mt-2.5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1 font-display">
            <span className="text-3xl font-bold tracking-tight text-ink">
              {creditedHours.toFixed(1)}
            </span>
            <span className="text-sm font-bold text-ink-subtle">
              / {creditedTarget.toFixed(1)} Hrs Required
            </span>
          </div>
          <span className="text-xs font-semibold text-ink-muted">
            {creditedRemaining > 0
              ? `${creditedRemaining.toFixed(1)}h Remaining`
              : "Target Met"}
          </span>
        </div>

        <div className="elev-pressed mt-3.5 h-2.5 w-full overflow-hidden rounded-full p-0.5">
          <div
            className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
            style={{ width: `${Math.max(creditedPercent, 0)}%` }}
          />
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-ink-subtle">
          Attendance hours are credited toward your requirement once you submit
          an output for that day — pending, approved or rejected. Hours logged
          without any submission stay in your attendance history and do not
          count toward the requirement.
        </p>
      </div>
    </div>
  );
}
