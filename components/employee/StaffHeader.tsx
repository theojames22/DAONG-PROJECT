"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

interface StaffHeaderProps {
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
}

export default function StaffHeader({
  selectedDate,
  onSelectDate,
}: StaffHeaderProps) {
  const [timeString, setTimeString] = useState<string>("");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const time = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const tzMatch = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
        .formatToParts(now)
        .find((part) => part.type === "timeZoneName");
      const tz = tzMatch?.value || "PHT";
      setTimeString(`${time} ${tz}`);
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Page Title */}
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[26px]">
          Active Workstation Telemetry
        </h1>
      </div>

      {/* Top right info area: Date Selector & Live Station Clock */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Date Selector for dynamic telemetry */}
        {selectedDate && onSelectDate && (
          <div className="elev-1 flex items-center gap-2 rounded-xl px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-accent shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-subtle">
                Active Date
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onSelectDate(e.target.value)}
                className="bg-transparent font-mono text-xs font-bold text-ink outline-none cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Station Clock */}
        <div className="elev-1 flex items-center gap-2.5 rounded-xl px-3.5 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <div className="flex flex-col">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-subtle">
              Station Clock
            </span>
            <span className="font-mono text-xs font-bold tracking-tight text-ink">
              {timeString || "14:54:32 EST"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
