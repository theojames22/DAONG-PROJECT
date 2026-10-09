"use client";

interface WeeklyQuotaCardProps {
  hoursThisWeek: number;
  requiredWeeklyHours: number;
  standbyHours?: number;
  overtimeHours?: number;
  percentMet?: number;
  remainingHours?: number;
}

export default function WeeklyQuotaCard({
  hoursThisWeek,
  requiredWeeklyHours,
  standbyHours = 0,
  overtimeHours,
  percentMet,
  remainingHours,
}: WeeklyQuotaCardProps) {
  const target = requiredWeeklyHours > 0 ? requiredWeeklyHours : 40;
  const percentage =
    percentMet !== undefined
      ? percentMet
      : Math.min(Math.round((hoursThisWeek / target) * 100), 100);
  const remaining =
    remainingHours !== undefined
      ? remainingHours
      : Math.max(0, target - hoursThisWeek);
  const coreShift = Math.min(hoursThisWeek, target);
  const overtime =
    overtimeHours !== undefined
      ? overtimeHours
      : Math.max(0, hoursThisWeek - target);

  return (
    <div className="neu-raised rounded-neu p-5">
      {/* Top: Header & Percentage */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
          Weekly Target Quota
        </span>
        <span className="text-xs font-bold text-accent">{percentage}% Met</span>
      </div>

      {/* Main Metric & Remaining */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1 font-display">
          <span className="text-3xl font-bold tracking-tight text-ink">
            {hoursThisWeek.toFixed(1)}
          </span>
          <span className="text-sm font-bold text-ink-subtle">
            / {target.toFixed(1)} Hrs
          </span>
        </div>
        <span className="text-xs font-semibold text-ink-muted">
          {remaining > 0 ? `${remaining.toFixed(1)}h Remaining` : "Target Met"}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="elev-pressed mt-3.5 h-2.5 w-full overflow-hidden rounded-full p-0.5">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
          style={{ width: `${Math.max(percentage, 0)}%` }}
        />
      </div>

      {/* 3-Column Breakdown */}
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
  );
}
