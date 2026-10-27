/**
 * Pure week/compliance helpers.
 *
 * Everything here works on YYYY-MM-DD date keys, never on a bare Date, so
 * the server and the browser always agree on which Monday a week starts on.
 * The actual attendance timestamps stay in the app timezone
 * (app_settings.timezone); only the clock conversions at the bottom touch
 * time zones, and those are used for query bounds and the week countdown.
 */

import type {
  ComplianceStatus,
  ComplianceStatusGroup,
} from "./types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** 0 = Monday … 6 = Sunday for a YYYY-MM-DD key. */
export function mondayIndex(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(dateKey: string): string {
  return shiftDateKey(dateKey, -mondayIndex(dateKey));
}

export function isValidDateKey(
  value: string | null | undefined
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(weekStart, index));
}

export function isWorkdayIndex(index: number): boolean {
  return index >= 0 && index <= 4;
}

function utcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shortDate(dateKey: string): string {
  return utcDate(dateKey).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = utcDate(weekStart);
  const end = utcDate(weekEnd);
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  if (startYear === endYear) {
    return `${shortDate(weekStart)} – ${shortDate(weekEnd)}, ${endYear}`;
  }
  return `${shortDate(weekStart)}, ${startYear} – ${shortDate(weekEnd)}, ${endYear}`;
}

export function formatWeekShortLabel(weekStart: string, weekEnd: string): string {
  return `${shortDate(weekStart)} – ${shortDate(weekEnd)}`;
}

export function formatDayDate(dateKey: string): string {
  return shortDate(dateKey);
}

export function dateNumber(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
}

export function dayLabel(index: number): string {
  return DAY_LABELS[index] ?? "";
}

/** ISO-8601 week number, computed in UTC from the Monday key. */
export function isoWeekNumber(dateKey: string): number {
  const date = utcDate(dateKey);
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNumber = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  return (
    1 +
    Math.round(
      (thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000)
    )
  );
}

/**
 * Completed Monday–Friday days in the selected week.
 *
 * The reference treats "expected" as everything through yesterday: on
 * Monday nothing is expected yet, by Friday the whole working week is.
 * A past week is fully expected.
 */
export function completedWorkdays(
  weekStart: string,
  todayKey: string,
  isCurrentWeek: boolean
): number {
  if (!isCurrentWeek) return 5;
  let count = 0;
  for (let index = 0; index < 5; index += 1) {
    if (shiftDateKey(weekStart, index) < todayKey) count += 1;
  }
  return count;
}

/** Workdays left in the week, today included (0 on Saturday/Sunday). */
export function remainingWorkdays(
  weekStart: string,
  weekEnd: string,
  todayKey: string
): number {
  let count = 0;
  for (let index = 0; index < 5; index += 1) {
    const key = shiftDateKey(weekStart, index);
    if (key >= todayKey && key <= weekEnd) count += 1;
  }
  return count;
}

export interface StatusMeta {
  label: string;
  bg: string;
  fg: string;
  dot: string;
  fill: string;
  group: ComplianceStatusGroup;
  /** Lower = more urgent; used by "Needs attention first". */
  rank: number;
}

export const STATUS_META: Record<ComplianceStatus, StatusMeta> = {
  met: {
    label: "Met",
    bg: "#DDF5E7",
    fg: "#0F6A3C",
    dot: "#1F9D5B",
    fill: "linear-gradient(90deg, #1F9D5B, #54C98D)",
    group: "met",
    rank: 3,
  },
  on_pace: {
    label: "On pace",
    bg: "#E6EEFF",
    fg: "#1D4FD8",
    dot: "#2563EB",
    fill: "linear-gradient(90deg, #2563EB, #4C8BFF)",
    group: "track",
    rank: 2,
  },
  behind: {
    label: "Behind pace",
    bg: "#FFF0D1",
    fg: "#8A5200",
    dot: "#E8890C",
    fill: "linear-gradient(90deg, #E8890C, #F4B54A)",
    group: "attn",
    rank: 1,
  },
  at_risk: {
    label: "At risk",
    bg: "#FDE5E5",
    fg: "#A82222",
    dot: "#D64545",
    fill: "linear-gradient(90deg, #D64545, #E98080)",
    group: "attn",
    rank: 0,
  },
  short: {
    label: "Short",
    bg: "#FDE5E5",
    fg: "#A82222",
    dot: "#D64545",
    fill: "linear-gradient(90deg, #D64545, #E98080)",
    group: "attn",
    rank: 0,
  },
  no_target: {
    label: "No target",
    bg: "#EEF2F8",
    fg: "#44506A",
    dot: "#CBD5E1",
    fill: "linear-gradient(90deg, #94A3B8, #CBD5E1)",
    group: "na",
    rank: 9,
  },
};

/**
 * The authoritative rule stays `Met = credited >= required`. Pace labels
 * only subdivide current-week shortfalls; they never turn raw logged hours
 * into compliance, and past weeks stay Met / Short.
 */
export function complianceStatus(
  creditedHours: number,
  requiredHours: number,
  options: {
    isCurrentWeek: boolean;
    expectedHours: number;
    dailyTarget: number;
  }
): ComplianceStatus {
  if (requiredHours <= 0) return "no_target";
  if (creditedHours >= requiredHours) return "met";
  if (!options.isCurrentWeek) return "short";
  if (creditedHours >= options.expectedHours) return "on_pace";
  if (creditedHours >= options.expectedHours - options.dailyTarget) {
    return "behind";
  }
  return "at_risk";
}

export function statusLabel(status: ComplianceStatus, remainingHours: number): string {
  if (status === "short") return `Short ${remainingHours.toFixed(1)}h`;
  return STATUS_META[status].label;
}

export function statusCaption(
  status: ComplianceStatus,
  creditedHours: number,
  requiredHours: number,
  remainingHours: number
): string {
  if (status === "no_target") return "No weekly target";
  if (status === "met") {
    return creditedHours - requiredHours > 0.04
      ? `+${(creditedHours - requiredHours).toFixed(1)}h over target`
      : "Target met";
  }
  if (status === "short") {
    return `Closed ${remainingHours.toFixed(1)}h short`;
  }
  return `${remainingHours.toFixed(1)}h to go`;
}

export function initialsFor(name: string): string {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/* ------------------------------------------------------------------ */
/* Time-zone conversion (query bounds + week countdown)                */
/* ------------------------------------------------------------------ */

function wallClockParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = wallClockParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

/** The UTC instant for a wall-clock time in the app timezone. */
export function zonedTimeToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Second pass handles the offset changing across a DST boundary.
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

export function startOfDayUtc(dateKey: string, timeZone: string): Date {
  return zonedTimeToUtc(dateKey, 0, 0, 0, timeZone);
}

export function endOfWeekUtc(weekEnd: string, timeZone: string): Date {
  const nextMonday = shiftDateKey(weekEnd, 1);
  return new Date(startOfDayUtc(nextMonday, timeZone).getTime() - 1);
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Week closed";
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `Week ends in ${days}d ${String(hours).padStart(2, "0")}h ${String(
    minutes
  ).padStart(2, "0")}m`;
}

export function formatSignedGap(gap: number): string {
  const sign = gap >= 0 ? "+" : "−";
  return `${sign}${Math.abs(gap).toFixed(1)}h`;
}

/**
 * Shared scale for the small seven-day bars. The design uses a 10-hour
 * track, so an 8-hour day reads as 80% rather than filling the column.
 * Bars cap at 100% if someone logs a longer day.
 */
export const DAILY_BAR_SCALE = 10;
