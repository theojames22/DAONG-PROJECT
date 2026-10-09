"use client";

import { useState } from "react";
import { Check, Clock, CalendarDays, ListFilter } from "lucide-react";

export interface DayTelemetryItem {
  code: string;
  name: string;
  date: string;
  dateStr: string;
  timeRange: string;
  hours: number;
  status: "verified" | "active" | "empty";
  sessionCount: number;
  isSelected?: boolean;
}

export interface DaySessionItem {
  id: string;
  sessionNumber: number;
  timeIn: string;
  timeOut: string;
  duration: string;
  isOpen: boolean;
}

interface WeekTelemetryCardProps {
  weekTelemetry: DayTelemetryItem[];
  daySessions: DaySessionItem[];
  selectedDate: string;
  onSelectDate?: (date: string) => void;
  cycleCode?: string;
}

export default function WeekTelemetryCard({
  weekTelemetry,
  daySessions,
  selectedDate,
  onSelectDate,
  cycleCode,
}: WeekTelemetryCardProps) {
  const [viewMode, setViewMode] = useState<"week" | "daily">("week");

  // Fallback calculation for cycle if not passed
  const currentCycle =
    cycleCode ||
    (() => {
      const now = new Date(selectedDate || Date.now());
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `W${weekNum}-${now.getFullYear()}`;
    })();

  return (
    <div className="neu-raised rounded-neu p-5 flex flex-col gap-3">
      {/* Header with View Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-ink">
            {viewMode === "week" ? "Current Week Telemetry" : "Daily Attendance Table"}
          </h3>
          <span className="font-mono text-[10px] font-semibold uppercase text-ink-subtle">
            {viewMode === "week" ? `Cycle ${currentCycle}` : selectedDate}
          </span>
        </div>

        {/* Tab Toggle */}
        <div className="elev-pressed flex rounded-lg p-0.5 text-[10.5px] font-semibold">
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
              viewMode === "week"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-ink-muted hover:text-accent-dark"
            }`}
          >
            <CalendarDays className="h-3 w-3" />
            <span>Week</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("daily")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
              viewMode === "daily"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-ink-muted hover:text-accent-dark"
            }`}
          >
            <ListFilter className="h-3 w-3" />
            <span>Day Table</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Week Telemetry List */}
      {viewMode === "week" && (
        <div className="mt-1 flex flex-col divide-y divide-border">
          {weekTelemetry.length === 0 ? (
            /* Fallback row if empty array returned */
            <div className="py-6 text-center text-xs text-ink-subtle font-medium">
              No records found for this date
            </div>
          ) : (
            weekTelemetry.map((d) => {
              const isSelected = d.date === selectedDate;

              return (
                <div
                  key={d.date}
                  onClick={() => onSelectDate && onSelectDate(d.date)}
                  className={`flex items-center justify-between py-2.5 px-2 rounded-xl transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-accent-soft"
                      : "hover:bg-accent-soft/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Day Code Pill */}
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-accent-soft text-accent-dark"
                      }`}
                    >
                      {d.code}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-ink leading-tight">
                        {d.dateStr}
                      </p>
                      <p className="text-[11px] text-ink-subtle leading-tight mt-0.5">
                        {d.timeRange}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {d.status === "verified" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success">
                        <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                        <span>{d.hours.toFixed(1)}h Verified</span>
                      </span>
                    )}
                    {d.status === "active" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                        <span>{d.hours.toFixed(1)}h Active Session</span>
                      </span>
                    )}
                    {d.status === "empty" && (
                      <span className="inline-flex items-center rounded-full elev-pressed px-2 py-0.5 text-[10.5px] font-medium text-ink-subtle">
                        0.0h • No records
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: Daily Attendance Table for selectedDate */}
      {viewMode === "daily" && (
        <div className="mt-1 flex flex-col">
          {/* Table Column Headers */}
          <div className="grid grid-cols-4 gap-2 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle border-b border-border">
            <span>Session</span>
            <span>Time In</span>
            <span>Time Out</span>
            <span className="text-right">Duration</span>
          </div>

          {/* Missing Data State: Graceful fallback row */}
          {daySessions.length === 0 ? (
            <div className="py-7 text-center text-xs text-ink-subtle font-medium">
              No records found for this date
            </div>
          ) : (
            <div className="divide-y divide-border">
              {daySessions.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-4 items-center gap-2 py-2 text-xs text-ink"
                >
                  <span className="font-semibold text-ink">
                    Shift #{s.sessionNumber}
                  </span>
                  <span className="font-mono text-ink-muted">{s.timeIn}</span>
                  <span className="font-mono text-ink-muted">
                    {s.isOpen ? (
                      <span className="inline-flex items-center gap-1 text-accent font-semibold">
                        <Clock className="h-3 w-3" /> Live
                      </span>
                    ) : (
                      s.timeOut
                    )}
                  </span>
                  <span className="text-right font-bold text-ink font-mono">
                    {s.duration}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
