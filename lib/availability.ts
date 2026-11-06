import type { AvailabilityWithProfile, Profile } from "./types";

/** The profile fields the Head schedule panel needs. */
export type SchedulePerson = Pick<Profile, "id" | "full_name" | "position">;

/** Status of one person's availability on one date. */
export type ScheduleDayStatus = "available" | "partial" | "unavailable" | "none";

/**
 * A real availability row counts as available unless it was explicitly
 * marked unavailable. The database column defaults to 'available', and
 * older installs without the column also behave as available — but the
 * row itself must exist: missing schedules are never treated as available.
 */
export function isAvailableRow(
  row: Pick<AvailabilityWithProfile, "status">
): boolean {
  return row.status !== "unavailable";
}

/** Group rows by date, with each day's periods ordered by start time. */
export function groupAvailabilityByDate(
  rows: AvailabilityWithProfile[]
): Map<string, AvailabilityWithProfile[]> {
  const byDate = new Map<string, AvailabilityWithProfile[]>();

  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (existing) {
      existing.push(row);
    } else {
      byDate.set(row.date, [row]);
    }
  }

  for (const dayRows of byDate.values()) {
    dayRows.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return byDate;
}

/** All of one person's availability rows on a single date. */
export function rowsForPersonOnDate(
  rowsByDate: Map<string, AvailabilityWithProfile[]>,
  personId: string,
  dateKey: string
): AvailabilityWithProfile[] {
  return (rowsByDate.get(dateKey) ?? []).filter(
    (row) => row.employee_id === personId
  );
}

/**
 * Missing rows and explicit "unavailable" rows are different states.
 * `partial` means the person submitted at least one available period and
 * at least one unavailable period on the same day.
 */
export function personDayStatus(
  rows: AvailabilityWithProfile[]
): ScheduleDayStatus {
  if (rows.length === 0) return "none";

  const available = rows.filter(isAvailableRow);
  if (available.length === 0) return "unavailable";
  return available.length === rows.length ? "available" : "partial";
}

export interface AvailablePersonEntry {
  person: SchedulePerson;
  /** Only the person's available rows, ordered by start time. */
  rows: AvailabilityWithProfile[];
  status: "available" | "partial";
}

/**
 * People who actually have at least one available time slot on `dateKey`.
 *
 * - Rows are grouped by employee so multiple periods produce one entry.
 * - People with no rows are excluded.
 * - People who only marked themselves unavailable are excluded.
 * - `partial` people are included with their available periods only.
 * - Output order follows `people`, i.e. the API's name ordering.
 */
export function availablePeopleForDate(
  people: SchedulePerson[],
  rowsByDate: Map<string, AvailabilityWithProfile[]>,
  dateKey: string
): AvailablePersonEntry[] {
  const dayRows = rowsByDate.get(dateKey) ?? [];
  if (dayRows.length === 0) return [];

  const byPerson = new Map<string, AvailabilityWithProfile[]>();
  for (const row of dayRows) {
    const existing = byPerson.get(row.employee_id);
    if (existing) {
      existing.push(row);
    } else {
      byPerson.set(row.employee_id, [row]);
    }
  }

  const entries: AvailablePersonEntry[] = [];

  for (const person of people) {
    const rows = byPerson.get(person.id);
    if (!rows || rows.length === 0) continue;

    const status = personDayStatus(rows);
    if (status !== "available" && status !== "partial") continue;

    entries.push({
      person,
      rows: rows
        .filter(isAvailableRow)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
      status,
    });
  }

  return entries;
}
