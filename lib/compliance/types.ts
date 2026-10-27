/**
 * Serializable shapes for the Weekly Compliance page.
 *
 * The same payload is produced by the server page (first paint) and by
 * GET /api/head/compliance (week changes + live refreshes), so the two
 * surfaces can never disagree about an employee's numbers.
 */

export type ComplianceStatus =
  | "met"
  | "on_pace"
  | "behind"
  | "at_risk"
  | "short"
  | "no_target";

export type ComplianceStatusGroup = "met" | "track" | "attn" | "na";

export interface ComplianceDay {
  /** YYYY-MM-DD in the app timezone. */
  key: string;
  /** Mon … Sun */
  label: string;
  /** "Oct 26" */
  dateLabel: string;
  /** "26" */
  dateNumber: string;
  isToday: boolean;
  isFuture: boolean;
  isWorkday: boolean;
}

export interface ComplianceDayCell {
  date: string;
  label: string;
  dateLabel: string;
  hours: number;
  hasRecord: boolean;
  isToday: boolean;
  isFuture: boolean;
  isWorkday: boolean;
}

export interface ComplianceEmployee {
  id: string;
  name: string;
  position: string;
  avatarUrl: string | null;
  initials: string;
  requiredHours: number;
  /** employee_week_hours.credited_hours — the compliance metric. */
  creditedHours: number;
  /** Raw session hours, including an open shift up to the fetch time. */
  loggedHours: number;
  remainingHours: number;
  /** Credited ÷ required, uncapped. 0 when there is no target. */
  percent: number;
  /** Required × completed weekdays ÷ 5. */
  expectedHours: number;
  /** required ÷ 5 */
  dailyTarget: number;
  status: ComplianceStatus;
  statusGroup: ComplianceStatusGroup;
  statusLabel: string;
  caption: string;
  isOnClock: boolean;
  days: ComplianceDayCell[];
}

export interface ComplianceTeam {
  staffCount: number;
  /** Staff with a positive weekly requirement. */
  trackedCount: number;
  /** Raw session hours across every staff member. */
  loggedHours: number;
  requiredHours: number;
  /** Credited hours for tracked staff only (no-target staff are excluded). */
  creditedHours: number;
  /** Credited ÷ required, uncapped. 0 when there is no requirement. */
  percent: number;
  belowCount: number;
  remainingHours: number;
  /** Sum of each person's required ÷ 5. */
  dailyTarget: number;
  /** Expected credited hours through yesterday (or the full week). */
  expectedHours: number;
  /** Logged hours minus expected hours. */
  gapHours: number;
  /** True when every tracked person has the same weekly requirement. */
  uniformRequired: number | null;
  /** True when every tracked person has the same daily target. */
  uniformDailyTarget: number | null;
  /** Weekdays (Mon–Fri) that have already finished in the selected week. */
  completedWorkdays: number;
  /** Shared scale for the small per-day bars: 10h, like the design. */
  dailyBarScale: number;
  /** Daily totals across the team, Monday → Sunday. */
  dailyTotals: number[];
}

export interface WeeklyCompliancePayload {
  /** Monday, YYYY-MM-DD in the app timezone. */
  weekStart: string;
  /** Sunday, YYYY-MM-DD. */
  weekEnd: string;
  /** "Oct 26 – Nov 1, 2026" */
  weekLabel: string;
  /** "Oct 26 – Nov 1" */
  weekShortLabel: string;
  weekNumber: number;
  /** "This week" on the current week, otherwise the short range. */
  navLabel: string;
  currentWeekStart: string;
  todayKey: string;
  timezone: string;
  isCurrentWeek: boolean;
  /** ISO instant when the selected week closes; null for past weeks. */
  weekEndsAt: string | null;
  /** When this payload was built — used to keep the countdown honest. */
  generatedAt: string;
  days: ComplianceDay[];
  team: ComplianceTeam;
  employees: ComplianceEmployee[];
}
