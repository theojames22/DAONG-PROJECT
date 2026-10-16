"use client";

import { useEffect, useState } from "react";

/**
 * Live time + date chip matching the reference design.
 * Format: [● 06:22:07 PM | Mon, Oct 12]
 */
export default function LiveClockChip() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeMajor = now
    ? now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--:--";

  const timeMinor = now
    ? now.toLocaleTimeString("en-US", {
        second: "2-digit",
        hour12: true,
      }).slice(-6) // e.g. ":07 PM"
    : ":-- --";

  const date = now
    ? now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Loading…";

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all hover:border-slate-300">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-mono text-[13px] tabular-nums">
        <strong className="font-bold text-slate-900">{timeMajor}</strong>
        <span className="text-slate-500">{timeMinor}</span>
      </span>
      <span className="h-3.5 w-px bg-slate-200" aria-hidden="true" />
      <span className="text-[12px] font-medium text-slate-600">{date}</span>
    </div>
  );
}
