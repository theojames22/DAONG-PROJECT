"use client";

import { useState } from "react";
import { CalendarDays, Clock, Check, ListFilter } from "lucide-react";
import { toDateKey } from "@/lib/attendance";

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

/**
 * Calculates ISO week number for a given date string or Date
 */
function getWeekNumber(dateInput: Date | string): number {
  try {
    const d = new Date(dateInput);
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  } catch {
    return 1;
  }
}

export default function WeekTelemetryCard({
  weekTelemetry,
  daySessions,
  selectedDate,
  onSelectDate,
  cycleCode,
}: WeekTelemetryCardProps) {
  const [viewMode, setViewMode] = useState<"week" | "daily">("week");

  // Determine "Week 42" style label
  const weekLabel = (() => {
    if (cycleCode) {
      const match = cycleCode.match(/W(\d+)/i);
      if (match) return `Week ${match[1]}`;
    }
    const num = getWeekNumber(selectedDate || new Date().toISOString());
    return `Week ${num}`;
  })();

  const todayKey = toDateKey(new Date().toISOString());

  return (
    <div className="bg-white rounded-[20px] border border-staff-border p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] flex flex-col gap-4 enter-up enter-d2">
      {/* Header with Title, Cycle Pill & Week / Day toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base sm:text-[17px] font-bold text-staff-ink tracking-tight">
            This week
          </h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-staff-soft text-staff-blue-ink">
            {weekLabel}
          </span>
        </div>

        {/* Week / Day Segmented Toggle */}
        <div className="inline-flex items-center p-1 rounded-full bg-staff-chip">
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              viewMode === "week"
                ? "bg-white text-staff-ink shadow-sm font-bold"
                : "text-staff-body hover:text-staff-ink"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Week</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("daily")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              viewMode === "daily"
                ? "bg-white text-staff-ink shadow-sm font-bold"
                : "text-staff-body hover:text-staff-ink"
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" />
            <span>Day</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Week List (Monday to Friday) */}
      {viewMode === "week" && (
        <div className="flex flex-col gap-2">
          {weekTelemetry.length === 0 ? (
            <div className="py-8 text-center text-xs text-staff-body font-medium">
              No records found for this week
            </div>
          ) : (
            weekTelemetry.map((d) => {
              const isToday = d.date === todayKey;
              const isSelected = d.date === selectedDate;
              const isFuture = d.date > todayKey;

              return (
                <div
                  key={d.date}
                  onClick={() => onSelectDate && onSelectDate(d.date)}
                  className={`group flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                    isToday
                      ? "bg-staff-card-2 border-staff-blue/40 shadow-sm ring-1 ring-staff-blue/20"
                      : isSelected
                      ? "bg-staff-card-2 border-staff-blue/30"
                      : "bg-white border-staff-border hover:border-staff-blue/30 hover:bg-staff-card-2"
                  }`}
                >
                  {/* Left: Day Indicator & Date Range */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold transition-colors ${
                        isToday
                          ? "bg-staff-blue text-white shadow-sm"
                          : "bg-staff-chip text-staff-ink group-hover:bg-staff-soft group-hover:text-staff-blue-ink"
                      }`}
                    >
                      {d.code}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs sm:text-[13px] font-bold text-staff-ink leading-tight truncate">
                          {d.dateStr}
                        </p>
                        {isToday && (
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-staff-blue text-white tracking-wide">
                            Today
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-staff-body leading-tight mt-0.5 truncate">
                        {isFuture
                          ? "Upcoming"
                          : d.timeRange || "No records recorded"}
                      </p>
                    </div>
                  </div>

                  {/* Right: Functional Status Chips */}
                  <div className="shrink-0 pl-2">
                    {isFuture ? (
                      <span className="inline-flex items-center rounded-full bg-staff-chip px-2.5 py-1 text-xs font-semibold text-staff-body">
                        Upcoming
                      </span>
                    ) : d.status === "active" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-staff-soft px-2.5 py-1 text-xs font-bold text-staff-blue-ink">
                        <span className="h-1.5 w-1.5 rounded-full bg-staff-blue animate-pulse" />
                        <span>{d.hours > 0 ? `${d.hours.toFixed(1)}h Active` : "Active"}</span>
                      </span>
                    ) : d.hours > 0 || d.status === "verified" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-staff-success-soft px-2.5 py-1 text-xs font-bold text-staff-success">
                        <Check className="h-3 w-3 stroke-[2.5]" />
                        <span>{d.hours.toFixed(1)}h verified</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-staff-chip px-2.5 py-1 text-xs font-semibold text-staff-body">
                        0.0h
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: Day Table for Selected Date / Today */}
      {viewMode === "daily" && (
        <div className="flex flex-col gap-2">
          {/* Table Header */}
          <div className="grid grid-cols-4 gap-2 px-3 py-2 text-[11px] font-bold text-staff-body uppercase tracking-wider border-b border-staff-border">
            <span>Session</span>
            <span>Time In</span>
            <span>Time Out</span>
            <span className="text-right">Duration</span>
          </div>

          {/* Table Rows */}
          {daySessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-staff-body font-medium">
              No attendance records recorded for this day
            </div>
          ) : (
            <div className="divide-y divide-staff-border">
              {daySessions.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-4 items-center gap-2 px-3 py-2.5 text-xs text-staff-ink"
                >
                  <span className="font-bold text-staff-ink">
                    Shift #{s.sessionNumber}
                  </span>
                  <span className="font-medium text-staff-body">{s.timeIn}</span>
                  <span className="font-medium text-staff-body">
                    {s.isOpen ? (
                      <span className="inline-flex items-center gap-1 text-staff-blue-ink font-bold">
                        <Clock className="h-3 w-3" /> Live
                      </span>
                    ) : (
                      s.timeOut
                    )}
                  </span>
                  <span className="text-right font-extrabold text-staff-ink">
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
