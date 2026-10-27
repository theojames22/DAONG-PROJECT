/**
 * Report data assembly — one implementation shared by the month view,
 * the details drawer and both exports, so they can never disagree.
 *
 * Everything is computed on the server from real rows:
 *   profiles (weekly requirement) + attendance_days / attendance_day_status
 *   + outputs (any submission credits the day; approved = 'done').
 *
 * The current month is provisional (live, prorated to elapsed working
 * days). A closed month is finalized on demand into a frozen snapshot
 * and then read back from that snapshot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPLIANCE_STATUS_LABEL,
  ComplianceStatus,
} from "./constants";
import { buildReportRow, ReportDayRow, ReportPerson, ReportRow } from "./aggregate";
import { currentMonthKey, dateKeyIn, monthEndKey, monthStartKey } from "./calc";

const DEFAULT_TIMEZONE = "Asia/Manila";

export interface ReportFilters {
  month: string;
  employee?: string;
  position?: string;
  status?: string;
}

export interface ReportPersonView extends ReportPerson {}

export interface ReportRowView extends ReportRow {
  is_you: boolean;
}

export interface ReportSummary {
  total_eligible: number;
  tracked: number;
  not_applicable: number;
  compliant: { count: number; percent: number };
  needs_improvement: { count: number; percent: number };
  needs_attention: { count: number; percent: number };
}

export interface MonthReport {
  month: string;
  monthLabel: string;
  todayKey: string;
  isCurrentMonth: boolean;
  isFinalized: boolean;
  finalizedAt: string | null;
  people: ReportPersonView[];
  /** Rows after employee + position filters, before the status filter. */
  population: ReportRowView[];
  summary: ReportSummary;
  /** Rows after every filter, including compliance status. */
  rows: ReportRowView[];
}

export class ReportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReportError";
    this.status = status;
  }
}

/** Reads the app's configured timezone so day grouping matches the DB. */
export async function getAppTimezone(
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "timezone")
    .maybeSingle();
  return (data?.value as string) || DEFAULT_TIMEZONE;
}

function normalizeMonth(month: string | undefined, todayKey: string): string {
  const fallback = currentMonthKey(todayKey);
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return fallback;
  return month;
}

/** Staff are the reporting population; Heads are administrators and are
 *  excluded from required-hours compliance entirely. */
async function fetchEligiblePeople(
  supabase: SupabaseClient,
  filters: ReportFilters
): Promise<ReportPersonView[]> {
  let query = supabase
    .from("profiles")
    .select("id, full_name, position, required_weekly_hours")
    .eq("role", "staff")
    .order("full_name", { ascending: true });

  if (filters.employee) query = query.eq("id", filters.employee);
  if (filters.position) query = query.eq("position", filters.position);

  const { data, error } = await query;
  if (error) {
    console.error("[reports] eligible people query failed:", error.message);
    throw new ReportError("Could not load the report population.");
  }
  return (data ?? []) as ReportPersonView[];
}

export async function fetchMonthDayRows(
  supabase: SupabaseClient,
  month: string,
  employeeIds: string[]
): Promise<ReportDayRow[]> {
  if (employeeIds.length === 0) return [];

  // The punch timestamps come from attendance_days (where they live);
  // the submitted-output / credited flags come from the
  // attendance_day_status view. Merging them here keeps the reports
  // working regardless of which columns a given view revision exposes.
  const [{ data: daysData, error: daysError }, { data: statusData }] =
    await Promise.all([
      supabase
        .from("attendance_days")
        .select(
          "employee_id, date, hours, session_count, has_open_session, first_in, last_out"
        )
        .in("employee_id", employeeIds)
        .gte("date", monthStartKey(month))
        .lte("date", monthEndKey(month))
        .order("date", { ascending: true }),
      supabase
        .from("attendance_day_status")
        .select("employee_id, date, has_approved_output, is_credited")
        .in("employee_id", employeeIds)
        .gte("date", monthStartKey(month))
        .lte("date", monthEndKey(month)),
    ]);

  if (daysError) {
    console.error("[reports] day rows query failed:", daysError.message);
    throw new ReportError("Could not load attendance details for this report.");
  }

  const flags = new Map<
    string,
    { has_approved_output: boolean; is_credited: boolean }
  >();
  for (const row of (statusData ?? []) as ReportDayRow[]) {
    flags.set(`${row.employee_id}|${row.date}`, {
      has_approved_output: row.has_approved_output,
      is_credited: row.is_credited,
    });
  }

  return ((daysData ?? []) as ReportDayRow[]).map((row) => {
    const flag = flags.get(`${row.employee_id}|${row.date}`);
    return {
      ...row,
      has_approved_output: flag?.has_approved_output ?? false,
      is_credited: flag?.is_credited ?? false,
    };
  });
}

interface SnapshotRow {
  employee_id: string;
  required_hours: number;
  recorded_hours: number;
  credited_hours: number;
  compliance_percent: number;
  days_recorded: number;
  working_days: number;
  missing_days: number;
  incomplete_records: number;
  finalized_at: string;
}

/** Frozen rows from the snapshot table, mapped into the row shape. */
function rowsFromSnapshots(
  people: ReportPersonView[],
  snapshots: SnapshotRow[],
  viewerId: string
): ReportRowView[] {
  const byId = new Map(snapshots.map((s) => [s.employee_id, s]));
  return people.map((person) => {
    const snap = byId.get(person.id);
    const requiredHours = Number(snap?.required_hours ?? 0);
    const percent = Number(snap?.compliance_percent ?? 0);
    const status: ComplianceStatus =
      requiredHours <= 0
        ? "not_applicable"
        : percent >= 86
          ? "compliant"
          : percent >= 75
            ? "needs_improvement"
            : "needs_attention";

    return {
      employee_id: person.id,
      full_name: person.full_name,
      position: person.position,
      required_hours: requiredHours,
      recorded_hours: Number(snap?.recorded_hours ?? 0),
      credited_hours: Number(snap?.credited_hours ?? 0),
      compliance_percent: percent,
      status,
      days_recorded: Number(snap?.days_recorded ?? 0),
      elapsed_working_days: Number(snap?.working_days ?? 0),
      working_days: Number(snap?.working_days ?? 0),
      missing_days: Number(snap?.missing_days ?? 0),
      incomplete_records: Number(snap?.incomplete_records ?? 0),
      is_you: person.id === viewerId,
    };
  });
}

function buildSummary(
  population: ReportRowView[],
  totalEligible: number
): ReportSummary {
  const tracked = population.filter((r) => r.status !== "not_applicable");
  const notApplicable = population.length - tracked.length;
  const pct = (count: number) =>
    tracked.length === 0 ? 0 : Math.round((count / tracked.length) * 1000) / 10;
  const count = (status: ComplianceStatus) =>
    tracked.filter((r) => r.status === status).length;

  return {
    total_eligible: totalEligible,
    tracked: tracked.length,
    not_applicable: notApplicable,
    compliant: { count: count("compliant"), percent: pct(count("compliant")) },
    needs_improvement: {
      count: count("needs_improvement"),
      percent: pct(count("needs_improvement")),
    },
    needs_attention: {
      count: count("needs_attention"),
      percent: pct(count("needs_attention")),
    },
  };
}

/**
 * Full monthly report. `rawPeopleCount` is the eligible population
 * before the employee filter, used for the personnel totals.
 */
export async function assembleMonthReport(
  supabase: SupabaseClient,
  filters: ReportFilters,
  viewerId: string
): Promise<MonthReport> {
  const timezone = await getAppTimezone(supabase);
  const todayKey = dateKeyIn(timezone);
  const month = normalizeMonth(filters.month, todayKey);
  const currentMonth = currentMonthKey(todayKey);

  if (month > currentMonth) {
    throw new ReportError("That month hasn't happened yet.");
  }

  const isCurrentMonth = month === currentMonth;

  const people = await fetchEligiblePeople(supabase, {
    ...filters,
    month,
  });

  // The population for summary maths: same filters, status ignored.
  const populationPeople = await fetchEligiblePeople(supabase, {
    ...filters,
    status: "",
    month,
  });

  let rows: ReportRowView[];
  let isFinalized = false;
  let finalizedAt: string | null = null;

  if (isCurrentMonth) {
    // Provisional: live rows, prorated to elapsed working days.
    const dayRows = await fetchMonthDayRows(
      supabase,
      month,
      populationPeople.map((p) => p.id)
    );
    const byEmployee = new Map<string, ReportDayRow[]>();
    for (const row of dayRows) {
      const arr = byEmployee.get(row.employee_id) ?? [];
      arr.push(row);
      byEmployee.set(row.employee_id, arr);
    }
    rows = populationPeople.map((person) => ({
      ...buildReportRow(
        person,
        byEmployee.get(person.id) ?? [],
        month,
        todayKey
      ),
      is_you: person.id === viewerId,
    }));
  } else {
    // Closed month: read the frozen snapshot. Finalize only when the month
    // has never been finalized. Re-finalizing on every page load would
    // silently rewrite history (and bump its version) whenever a source row
    // changed; an explicit Head finalize call is the correction path.
    const { count: snapshotCount } = await supabase
      .from("monthly_report_snapshots")
      .select("employee_id", { count: "exact", head: true })
      .eq("month", `${month}-01`);

    if (!snapshotCount) {
      const { error: finalizeError } = await supabase.rpc("finalize_month_head", {
        p_month: `${month}-01`,
      });
      if (finalizeError) {
        if (finalizeError.code === "42883") {
          throw new ReportError(
            "Monthly reports aren't set up yet. Run supabase/security_hardening_2026-10-28.sql in your Supabase SQL editor.",
            400
          );
        }
        console.error("[reports] finalize failed:", finalizeError.message);
        throw new ReportError("Could not finalize this month. Try again.");
      }
    }

    const { data: snapshots, error: snapshotError } = await supabase
      .from("monthly_report_snapshots")
      .select(
        "employee_id, required_hours, recorded_hours, credited_hours, compliance_percent, days_recorded, working_days, missing_days, incomplete_records, finalized_at"
      )
      .eq("month", `${month}-01`)
      .in(
        "employee_id",
        populationPeople.map((p) => p.id)
      );

    if (snapshotError) {
      console.error("[reports] snapshot query failed:", snapshotError.message);
      throw new ReportError("Could not load the finalized report.");
    }
    const snapshotRows = (snapshots ?? []) as SnapshotRow[];

    rows = rowsFromSnapshots(populationPeople, snapshotRows, viewerId);
    isFinalized = true;
    finalizedAt =
      snapshotRows.length > 0 ? (snapshotRows[0].finalized_at ?? null) : null;
  }

  const summary = buildSummary(rows, populationPeople.length);

  // The status filter applies to the table only — the summary cards
  // deliberately ignore it.
  let filteredRows = rows;
  if (filters.status) {
    filteredRows = rows.filter((row) => row.status === filters.status);
  }

  return {
    month,
    monthLabel: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }),
    todayKey,
    isCurrentMonth,
    isFinalized,
    finalizedAt,
    people,
    population: rows,
    summary,
    rows: filteredRows,
  };
}

/** Status label helper for exports/UI (re-exported for convenience). */
export { COMPLIANCE_STATUS_LABEL };
export type { ComplianceStatus };
