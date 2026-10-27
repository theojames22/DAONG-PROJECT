/**
 * Monthly report aggregation — the single place a month's attendance
 * rows become a report row. Used identically for the provisional
 * (live) view, the finalization snapshot and the exports.
 *
 * Rules implemented here (see the Reports spec):
 *   working days        Monday–Friday (no holiday policy exists)
 *   required hours      elapsed working days × (weekly hours ÷ 5)
 *   recorded hours      completed sessions only; an OPEN session
 *                       (no time-out) is incomplete and contributes
 *                       no hours until corrected
 *   credited hours      recorded hours on a day with any submitted output
 *                       (pending, approved or rejected) — multiple
 *                       outputs on a day never multiply the hours
 *   missing days        elapsed working days with no attendance row
 *                       (an incomplete row is NOT missing)
 *   compliance %        credited ÷ required × 100, uncapped
 */

import {
  compliancePercent,
  getComplianceStatus,
  ComplianceStatus,
} from "./constants";
import { elapsedWorkingDays, monthEndKey, monthStartKey, monthWorkingDays } from "./calc";

export interface ReportPerson {
  id: string;
  full_name: string | null;
  position: string | null;
  required_weekly_hours: number;
}

/** One row of attendance_day_status for the month. */
export interface ReportDayRow {
  employee_id: string;
  date: string; // YYYY-MM-DD (local, from attendance_days)
  hours: number;
  session_count: number;
  has_open_session: boolean;
  /** True when any output exists for the day, whatever its review status. */
  has_output?: boolean;
  /** True only when an approved ('done') output exists for the day. */
  has_approved_output: boolean;
  is_credited: boolean;
  /** Per-day output state, used by the details drawer's output chips. */
  output_status?: "approved" | "pending" | "rejected" | "none";
  first_in: string | null;
  last_out: string | null;
}

export interface ReportRow {
  employee_id: string;
  full_name: string | null;
  position: string | null;
  /** Required hours for the period actually reported (prorated when provisional). */
  required_hours: number;
  /** Completed attendance hours in the month. */
  recorded_hours: number;
  credited_hours: number;
  compliance_percent: number;
  status: ComplianceStatus;
  /** Working days with completed attendance. */
  days_recorded: number;
  /** Working days that have elapsed (the whole month once finalized). */
  elapsed_working_days: number;
  /** All working days in the calendar month. */
  working_days: number;
  missing_days: number;
  incomplete_records: number;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildReportRow(
  person: ReportPerson,
  dayRows: ReportDayRow[],
  month: string,
  todayKey: string,
  options: { finalized?: boolean } = {}
): ReportRow {
  const allWorkingDays = monthWorkingDays(month);
  const elapsed = elapsedWorkingDays(month, todayKey);
  // A finalized month uses the month's full set of working days; the
  // current month prorates to the days that have elapsed.
  const effectiveWorkingDays = options.finalized
    ? allWorkingDays
    : elapsed.days;
  const workingDaySet = new Set(effectiveWorkingDays);

  const weekly = Number(person.required_weekly_hours) || 0;
  const requiredHours = round(
    (workingDaySet.size * weekly) / 5,
    2
  );

  // Rows are already per-person; keep the ones inside the month.
  const monthRows = dayRows.filter(
    (row) => row.date >= monthStartKey(month) && row.date <= monthEndKey(month)
  );

  let recordedHours = 0;
  let creditedHours = 0;
  let daysRecorded = 0;
  let incompleteRecords = 0;
  const daysWithAnyRow = new Set<string>();

  for (const row of monthRows) {
    daysWithAnyRow.add(row.date);
    if (row.has_open_session) {
      // Incomplete: hours still running — excluded until the clock closes.
      incompleteRecords += 1;
      continue;
    }
    const hours = Number(row.hours) || 0;
    recordedHours += hours;
    if (row.is_credited) creditedHours += hours;
    if (workingDaySet.has(row.date)) daysRecorded += 1;
  }

  // Missing = an elapsed working day with NO attendance row at all.
  let missingDays = 0;
  for (const dayKey of workingDaySet) {
    if (!daysWithAnyRow.has(dayKey)) missingDays += 1;
  }

  const percent = round(compliancePercent(creditedHours, requiredHours), 2);

  return {
    employee_id: person.id,
    full_name: person.full_name,
    position: person.position,
    required_hours: requiredHours,
    recorded_hours: round(recordedHours, 2),
    credited_hours: round(creditedHours, 2),
    compliance_percent: percent,
    status: getComplianceStatus(percent, requiredHours),
    days_recorded: daysRecorded,
    elapsed_working_days: effectiveWorkingDays.length,
    working_days: allWorkingDays.length,
    missing_days: missingDays,
    incomplete_records: incompleteRecords,
  };
}
