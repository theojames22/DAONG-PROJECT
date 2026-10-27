/**
 * Timezone-safe calendar helpers.
 *
 * The application stores attendance dates as YYYY-MM-DD keys in the zone
 * configured by `app_settings.timezone` (Asia/Manila by default). A Next.js
 * server usually runs in UTC, so using `Date#getDate()` or a bare
 * `new Date("YYYY-MM-DD")` on the server silently shifts days and weekly
 * windows. These helpers make the intended zone explicit.
 *
 * They are safe to import from client components too: `Intl` is available in
 * both runtimes and no server-only APIs are used.
 */

export const FALLBACK_TIMEZONE = "Asia/Manila";

function partsInZone(zone: string, instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** "YYYY-MM-DD" for an instant in a specific IANA timezone. */
export function dateKeyIn(zone: string, instant: Date = new Date()): string {
  const p = partsInZone(zone, instant);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function dateKeyToUtcParts(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * Convert a wall-clock date/time in `zone` to the corresponding UTC instant.
 * The two-pass offset calculation handles normal DST transitions; the app's
 * configured zone (Asia/Manila) has no DST, but this stays correct if the
 * setting is changed.
 */
export function zonedDateTimeToUtc(
  zone: string,
  dateKey: string,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): Date {
  const { year, month, day } = dateKeyToUtcParts(dateKey);
  const target = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let guess = target;

  for (let attempt = 0; attempt < 3; attempt++) {
    const p = partsInZone(zone, new Date(guess));
    const asUtc = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
      guess % 1000
    );
    const difference = target - asUtc;
    if (difference === 0) break;
    guess += difference;
  }

  return new Date(guess);
}

/** UTC ISO string for the first instant of a local calendar day. */
export function dayStartISO(dateKey: string, zone: string): string {
  return zonedDateTimeToUtc(zone, dateKey).toISOString();
}

/** UTC ISO string for the last instant of a local calendar day. */
export function dayEndISO(dateKey: string, zone: string): string {
  const next = addDaysToKey(dateKey, 1);
  return new Date(zonedDateTimeToUtc(zone, next).getTime() - 1).toISOString();
}

/** Add days to a date key without involving the host timezone. */
export function addDaysToKey(dateKey: string, days: number): string {
  const { year, month, day } = dateKeyToUtcParts(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a date key. */
export function dayOfWeek(dateKey: string): number {
  const { year, month, day } = dateKeyToUtcParts(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Monday–Sunday keys for the week containing `dateKey`. */
export function weekRangeForKey(dateKey: string): {
  start: string;
  end: string;
  days: string[];
} {
  const dow = dayOfWeek(dateKey);
  const monday = addDaysToKey(dateKey, dow === 0 ? -6 : 1 - dow);
  const days = Array.from({ length: 7 }, (_, index) =>
    addDaysToKey(monday, index)
  );
  return { start: days[0], end: days[6], days };
}

/** Monday–Sunday keys for the week containing an instant in `zone`. */
export function weekRangeIn(
  zone: string,
  instant: Date = new Date()
): { start: string; end: string; days: string[] } {
  return weekRangeForKey(dateKeyIn(zone, instant));
}

/** True for a real YYYY-MM-DD value (not just the right shape). */
export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = dateKeyToUtcParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
