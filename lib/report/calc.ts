/**
 * Report calculation helpers — month math, working-day enumeration and
 * the monthly attendance aggregation.
 *
 * Every date here is handled as a LOCAL YYYY-MM-DD key (the same
 * convention the rest of the app uses), computed in the app timezone
 * (app_settings.timezone) so the server never disagrees with the
 * calendar the user sees. A backend that used the browser timezone
 * would shift days for anyone east of UTC.
 */

/** "YYYY-MM-DD" for a Date in a specific IANA timezone. */
export function dateKeyIn(zone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function keyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Shift a date key by a number of days (handles month/year edges). */
export function shiftDateKey(dateKey: string, days: number): string {
  const d = dateFromKey(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return keyFromDate(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(dateKey: string): number {
  return dateFromKey(dateKey).getUTCDay();
}

export function isWeekend(dateKey: string): boolean {
  const dow = dayOfWeek(dateKey);
  return dow === 0 || dow === 6;
}

/** Inclusive list of working days (Mon–Fri) between two date keys. */
export function workingDaysBetween(startKey: string, endKey: string): string[] {
  const days: string[] = [];
  const end = dateFromKey(endKey);
  const cursor = dateFromKey(startKey);
  // Guard against runaway loops on bad input.
  let guard = 0;
  while (cursor <= end && guard < 1000) {
    if (!isWeekend(keyFromDate(cursor))) days.push(keyFromDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }
  return days;
}

export function monthStartKey(month: string): string {
  return `${month}-01`;
}

export function monthEndKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month = last day of this month.
  return keyFromDate(new Date(Date.UTC(y, m, 0)));
}

/** All working days (Mon–Fri) in a month. */
export function monthWorkingDays(month: string): string[] {
  return workingDaysBetween(monthStartKey(month), monthEndKey(month));
}

/**
 * Working days that have ELAPSED in the month: for a closed month that
 * is every working day; for the current month it runs only through
 * yesterday (today is still in progress).
 */
export function elapsedWorkingDays(
  month: string,
  todayKey: string
): { days: string[]; isCurrentMonth: boolean } {
  const start = monthStartKey(month);
  const end = monthEndKey(month);
  const isCurrentMonth = todayKey >= start && todayKey <= end;
  const cutoff = isCurrentMonth ? shiftDateKey(todayKey, -1) : end;
  if (cutoff < start) return { days: [], isCurrentMonth };
  return {
    days: workingDaysBetween(start, cutoff > end ? end : cutoff),
    isCurrentMonth,
  };
}

/** The previous month key ("2026-10" → "2026-09"). */
export function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(todayKey: string): string {
  return todayKey.slice(0, 7);
}

/** "2026-10" → "October 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** "2026-10" → "Oct 13, 2026" */
export function formatReportDate(dateKey: string): string {
  return dateFromKey(dateKey).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Minutes → "45 min" / "1 hr 30 min" / "2 hr" */
export function formatReportHours(hours: number): string {
  const total = Math.round((Number(hours) || 0) * 60);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

/** Hours with one decimal, the way hours are shown in the report. */
export function formatHoursValue(hours: number): string {
  return `${(Number(hours) || 0).toFixed(1)}h`;
}
