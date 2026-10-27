import { Session, Output, DayStatus } from "./types";

/** YYYY-MM-DD in local time, used as the grouping key for both sessions and outputs. */
export function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function groupByDate<T extends { time_in?: string; date?: string }>(
  items: T[]
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const key = item.date ?? toDateKey(item.time_in!);
    (out[key] ??= []).push(item);
  }
  return out;
}

/** Total hours across a set of sessions. An open session (no time_out) counts up to now. */
export function totalHours(sessions: Session[]): number {
  return sessions.reduce((sum, s) => {
    const start = new Date(s.time_in).getTime();
    const end = s.time_out ? new Date(s.time_out).getTime() : Date.now();
    return sum + (end - start) / 3_600_000;
  }, 0);
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/**
 * Exact completion percentage against a required target — no rounding and
 * no artificial minimum, so 1.3 of 40 hours is 3.25 (not 3). 0 required
 * yields 0 (never divide by zero).
 */
export function creditedPercent(creditedHours: number, requiredHours: number): number {
  if (requiredHours <= 0) return 0;
  return Math.max(0, Math.min(100, (creditedHours / requiredHours) * 100));
}

/** Formats an exact percentage for display: 3.25 → "3.25%", 100 → "100%". */
export function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  return `${Number(clamped.toFixed(2))}%`;
}

/** Add `days` to a YYYY-MM-DD date key, returning another local date key. */
export function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Compact Monday–Sunday label for the in-card week selector, e.g. "Oct 12 – Oct 18". */
export function formatWeekBadge(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekEnd}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${weekStart} – ${weekEnd}`;
  }
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

/**
 * Credited hours — the slice of attendance hours that counts toward the
 * weekly requirement (profiles.required_weekly_hours).
 *
 * Attendance hours are recorded for every clock-in/clock-out, but a day's
 * hours are credited as soon as that day has a submitted output — pending,
 * approved or rejected alike. So the two totals are tracked separately and
 * hours alone never satisfy the requirement.
 *
 * The value comes from the employee_week_hours view, which derives it from
 * attendance_days joined to submitted outputs. Because it is derived
 * rather than incremented, an output being reviewed, approved, rejected or
 * updated can never double count — each day's hours are summed at most
 * once, and a decision merely re-satisfies the join.
 */
export function creditedProgress(creditedHours: number, requiredHours: number) {
  const target = requiredHours > 0 ? requiredHours : 0;
  const percentMet =
    target > 0 ? Math.min(Math.round((creditedHours / target) * 100), 100) : 0;
  const remainingHours = Math.max(0, target - creditedHours);
  return {
    required: target,
    creditedHours,
    percentMet,
    remainingHours,
    targetMet: target > 0 && creditedHours >= target,
  };
}

/**
 * The core rule: clocking in/out alone isn't enough — a day only counts as
 * Present once at least one output has been submitted for it.
 *   - no time-in at all            → absent
 *   - time-in but no time-out yet  → incomplete (flagged, not penalized)
 *   - full sessions, no output     → unverified (hours logged, needs review)
 *   - full sessions + output       → present
 */
export function getDayStatus(
  sessions: Session[],
  outputs: Output[]
): DayStatus {
  if (sessions.length === 0) return "absent";
  if (sessions.some((s) => !s.time_out)) return "incomplete";
  if (outputs.length === 0) return "unverified";
  return "present";
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  present: "Present",
  unverified: "No output",
  incomplete: "Missing time-out",
  absent: "Absent",
};

/** Monday–Sunday range containing `date`, as YYYY-MM-DD date keys. */
export function getWeekRange(date: Date): { start: string; end: string; days: string[] } {
  const day = date.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(toDateKey(d.toISOString()));
  }

  return { start: days[0], end: days[6], days };
}

/**
 * Half-open date window for a "YYYY-MM" month: `start` is the first day and
 * `endExclusive` is the first day of the following month. Querying with an
 * exclusive upper bound avoids the invalid "YYYY-MM-31" literal that Postgres
 * rejects for months with fewer than 31 days.
 */
export function monthWindow(month: string): { start: string; endExclusive: string } {
  const [year, monthNumber] = month.split("-").map(Number); // 1-based month
  // JS months are 0-based, so passing the 1-based number lands on the 1st
  // of the NEXT month (and rolls the year over in December).
  const next = new Date(year, monthNumber, 1);
  const nextMonth = String(next.getMonth() + 1).padStart(2, "0");
  return {
    start: `${month}-01`,
    endExclusive: `${next.getFullYear()}-${nextMonth}-01`,
  };
}

/**
 * UTC ISO bounds for a LOCAL calendar day.
 *
 * Date keys everywhere in this app are local (YYYY-MM-DD, from toDateKey),
 * but `sessions.time_in` is a timestamptz. Handing Postgres the bare string
 * "2026-10-12T00:00:00" makes it interpret the bound in UTC — which for
 * GMT+8 means 08:00 local, silently dropping every early-morning session
 * (and the tail of the previous local day) from the results.
 *
 * Parsing the same string with `new Date(...)` gives a LOCAL instant, so
 * `toISOString()` is the correct UTC bound for the database.
 */
export function dayStartISO(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toISOString();
}

export function dayEndISO(dateKey: string): string {
  return new Date(`${dateKey}T23:59:59.999`).toISOString();
}
