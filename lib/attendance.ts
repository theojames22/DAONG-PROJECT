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
