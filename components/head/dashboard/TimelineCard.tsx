"use client";

import { useEffect, useMemo, useState } from "react";
import { FALLBACK_TIMEZONE } from "@/lib/time";

export interface TimelineEmployee {
  id: string;
  full_name: string | null;
  position: string | null;
  profile_picture_url?: string | null;
}

export interface TimelineSession {
  time_in: string;
  time_out: string | null;
}

export interface TimelineCardProps {
  employees: TimelineEmployee[];
  /** Today's sessions keyed by employee id. */
  sessionsByEmployee: Record<string, TimelineSession[]>;
  /** App timezone (app_settings.timezone) used for every clock reading. */
  timezone?: string;
}

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21];
const MINUTES_PER_DAY = 24 * 60;

/**
 * Minutes since local midnight in `zone`.
 *
 * Reading `Date#getHours()` uses the host clock, which is UTC on the server
 * and Asia/Manila in the browser. That difference is exactly what made the
 * "now" marker disagree during hydration, so both sides resolve the wall
 * clock through Intl instead.
 */
function minutesSinceMidnight(d: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  return (values.hour ?? 0) * 60 + (values.minute ?? 0) + (values.second ?? 0) / 60;
}

function formatClock(iso: string, zone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * 24-hour attendance timeline matching Image 2:
 * 8 ruler ticks (00, 03, 06, 09, 12, 15, 18, 21), vertical grid lines,
 * pill statuses, green bars for punches, and blue vertical indicator with time pill.
 */
export default function TimelineCard({
  employees,
  sessionsByEmployee,
  timezone = FALLBACK_TIMEZONE,
}: TimelineCardProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Null until after hydration: the server cannot know the browser's current
  // instant, and rendering one during SSR caused React to hydrate a different
  // `left` percentage. The marker simply appears on the first client tick.
  const nowPct = useMemo(() => {
    if (!now) return null;
    return Math.min(
      100,
      Math.max(0, (minutesSinceMidnight(now, timezone) / MINUTES_PER_DAY) * 100)
    );
  }, [now, timezone]);

  const nowLabel = useMemo(() => {
    if (!now) return null;
    return now.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, [now, timezone]);

  return (
    <section className="relative rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.08)] enter-up enter-d4">
      {/* Top Header & Legend */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Who is on the clock
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Every employee across the 24 hours of today.
          </p>
        </div>

        {/* Legend matching reference image */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            On the clock
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-300" />
            Not clocked in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-0.5 rounded-full bg-blue-600" />
            Now
          </span>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No employees found in the directory.
        </div>
      ) : (
        <div className="relative mt-8 overflow-x-auto pb-2">
          <div className="min-w-[650px]">
            {/* Hour Ruler Header */}
            <div className="flex items-center pb-3">
              {/* Left spacer for employee column */}
              <div className="w-48 sm:w-56 shrink-0" aria-hidden="true" />

              {/* 24-hour tick labels (8 columns of 3 hours) */}
              <div className="relative flex-1 flex justify-between pr-4">
                {TICKS.map((hour) => (
                  <span
                    key={hour}
                    className="text-xs font-semibold tabular-nums text-slate-400 -translate-x-1/2"
                  >
                    {String(hour).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            {/* Timeline Rows Container */}
            <div className="relative border-t border-slate-100">
              {/* Background vertical grid lines for the 8 ticks */}
              <div className="pointer-events-none absolute inset-0 left-48 sm:left-56 flex justify-between pr-4">
                {TICKS.map((hour) => (
                  <div
                    key={hour}
                    className="h-full border-l border-slate-100"
                    aria-hidden="true"
                  />
                ))}
              </div>

              {/* "Now" vertical indicator line and time pill — client-only so
                  the server and browser never disagree on the time. */}
              {nowPct !== null && nowLabel !== null && (
                <div
                  className="pointer-events-none absolute inset-y-0 left-48 sm:left-56 right-4 z-20"
                  aria-hidden="true"
                >
                  <div
                    className="absolute top-0 bottom-0 transition-all duration-1000 ease-linear"
                    style={{ left: `${nowPct}%` }}
                  >
                    {/* Top time badge */}
                    <span className="absolute -top-7 -translate-x-1/2 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm whitespace-nowrap">
                      {nowLabel}
                    </span>
                    {/* Vertical bar */}
                    <div className="h-full w-[2px] bg-blue-600 shadow-sm" />
                  </div>
                </div>
              )}

              {/* Employee Rows */}
              {employees.map((employee, idx) => {
                const sessions = sessionsByEmployee[employee.id] ?? [];
                const hasOpen = sessions.some((s) => !s.time_out);
                const hasSessions = sessions.length > 0;

                return (
                  <div
                    key={employee.id}
                    className={`relative flex items-center py-3.5 border-b border-slate-100/80 ${
                      idx === 0 ? "border-t-0" : ""
                    }`}
                  >
                    {/* Left employee profile info */}
                    <div className="flex w-48 sm:w-56 shrink-0 items-center gap-3 pr-4">
                      {employee.profile_picture_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={employee.profile_picture_url}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                          {initials(employee.full_name)}
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs sm:text-sm font-bold text-slate-800">
                          {employee.full_name || "Employee"}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {!hasSessions
                            ? "No punch yet"
                            : hasOpen
                            ? "On the clock"
                            : `Clocked in ${formatClock(sessions[0].time_in, timezone)}`}
                        </p>
                      </div>
                    </div>

                    {/* Timeline Track Area */}
                    <div className="relative h-9 flex-1 pr-4">
                      {/* Empty state: "Not clocked in" pill centered in track */}
                      {!hasSessions && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-100/70 bg-rose-50/80 px-3 py-1 text-xs font-medium text-rose-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Not clocked in
                          </span>
                        </div>
                      )}

                      {/* Active / Recorded punch bars */}
                      {sessions.map((session, sIdx) => {
                        const startMin = minutesSinceMidnight(
                          new Date(session.time_in),
                          timezone
                        );
                        const endMin = session.time_out
                          ? minutesSinceMidnight(
                              new Date(session.time_out),
                              timezone
                            )
                          : now
                          ? minutesSinceMidnight(now, timezone)
                          : startMin;

                        const left = Math.max(
                          0,
                          Math.min(100, (startMin / MINUTES_PER_DAY) * 100)
                        );
                        const width = Math.max(
                          0.8,
                          Math.min(
                            100 - left,
                            ((Math.max(startMin, endMin) - startMin) /
                              MINUTES_PER_DAY) *
                              100
                          )
                        );

                        return (
                          <div
                            key={`${session.time_in}-${sIdx}`}
                            className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-emerald-500 shadow-sm transition-all duration-500"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${formatClock(
                              session.time_in,
                              timezone
                            )} – ${
                              session.time_out
                                ? formatClock(session.time_out, timezone)
                                : "now"
                            }`}
                          />
                        );
                      })}

                      {/* Pill on the right when currently active */}
                      {hasOpen && (
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
