import { EquipmentUsage } from "./types";
import { toDateKey } from "./attendance";

/**
 * True when PostgREST rejected a query because a column doesn't exist
 * (SQLSTATE 42703). Used to tolerate environments that haven't run the
 * latest migration yet — notably the soft-cancel column on equipment_usage.
 */
export function isMissingColumnError(
  error: { code?: string } | null | undefined
): boolean {
  return error?.code === "42703";
}

/**
 * Format a minutes count the way the usage log shows durations:
 *   45        → "45 min"
 *   60        → "1 hr"
 *   90        → "1 hr 30 min"
 */
export function formatDuration(minutes: number): string {
  const mins = Math.round(Number(minutes) || 0);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

/** "Mon, Oct 12" — the bold date line in the history table. */
export function formatUsageDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "9:30 AM" — one end of the time range under the date. */
export function formatUsageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** True when an ISO timestamp falls inside the Monday–Sunday week bounds. */
export function isInWeek(iso: string, weekStart: string, weekEnd: string): boolean {
  const key = toDateKey(iso);
  return key >= weekStart && key <= weekEnd;
}

/**
 * Minutes between "YYYY-MM-DD" + "HH:mm" start and end on the same day.
 * Returns 0 when either value is missing or the end precedes the start.
 */
export function durationMinutesBetween(
  dateKey: string,
  startTime: string,
  endTime: string
): number {
  if (!dateKey || !startTime || !endTime) return 0;
  const start = new Date(`${dateKey}T${startTime}:00`);
  const end = new Date(`${dateKey}T${endTime}:00`);
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/** Local YYYY-MM-DD key for "today", used as the date field's max value. */
export function todayDateKey(): string {
  return toDateKey(new Date().toISOString());
}

/** Local "HH:mm" for an ISO timestamp — the value an <input type="time"> expects. */
export function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * Build the ISO timestamps for a usage entry from the form's
 * date + start/end time fields (all local, like the rest of the app).
 */
export function buildUsageRange(
  dateKey: string,
  startTime: string,
  endTime: string
): { startedAt: string; endedAt: string } {
  return {
    startedAt: new Date(`${dateKey}T${startTime}:00`).toISOString(),
    endedAt: new Date(`${dateKey}T${endTime}:00`).toISOString(),
  };
}

/** Count entries and total minutes for the "most used equipment" summary. */
export function mostUsedEquipment(
  entries: EquipmentUsage[]
): { equipmentId: string; count: number } | null {
  if (entries.length === 0) return null;
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.equipment_id, (counts.get(entry.equipment_id) ?? 0) + 1);
  }
  let top: { equipmentId: string; count: number } | null = null;
  for (const [equipmentId, count] of counts) {
    if (!top || count > top.count) top = { equipmentId, count };
  }
  return top;
}
