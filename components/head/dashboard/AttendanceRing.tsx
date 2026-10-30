"use client";

import { useEffect, useState } from "react";

export interface AttendanceRingProps {
  /** Number of employees counted as present. */
  present: number;
  /** Number of employees counted as absent. */
  absent: number;
  /** Total employees the ring is drawn against. */
  total: number;
  size?: number;
}

/**
 * Attendance progress ring matching reference design:
 * Clean segmented/curved ring with present (emerald/accent) and absent (soft rose/peach) arcs,
 * center figure showing "0/2 present" or `${present}/${total} present`.
 */
export default function AttendanceRing({
  present,
  absent,
  total,
  size = 120,
}: AttendanceRingProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const safeTotal = total > 0 ? total : 0;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const presentShare = safeTotal > 0 ? Math.min(present, safeTotal) / safeTotal : 0;
  const absentShare = safeTotal > 0 ? Math.min(absent, safeTotal) / safeTotal : 0;

  const presentLen = circumference * presentShare;
  const absentLen = circumference * absentShare;

  return (
    <div
      className="relative shrink-0 flex items-center justify-center transition-transform hover:scale-105 duration-300"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${present} of ${safeTotal} employees present today`}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Subtle background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={stroke}
        />

        {/* When 0 are present and all absent (as in reference image):
            a soft rose/peach track surrounds the circle */}
        {safeTotal > 0 && present === 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#fecdd3"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={mounted ? 0 : circumference}
            className="transition-all duration-1000 ease-out"
          />
        )}

        {/* Present arc (Emerald green when clocked in) */}
        {presentLen > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={mounted ? circumference * (1 - presentShare) : circumference}
            className="transition-all duration-1000 ease-out"
          />
        )}

        {/* Absent arc (soft rose/peach) */}
        {present > 0 && absentLen > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#fda4af"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${absentLen} ${circumference}`}
            strokeDashoffset={-(presentLen)}
            className="transition-all duration-1000 ease-out"
          />
        )}
      </svg>

      {/* Centre figure */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="font-extrabold text-[26px] leading-none tracking-tight text-slate-900 tabular-nums">
          {safeTotal > 0 ? (
            <>
              {present}
              <span className="text-slate-400 font-bold">/{safeTotal}</span>
            </>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          present
        </span>
      </div>
    </div>
  );
}
