/**
 * Report compliance thresholds — the SINGLE definition used by the
 * Reports page, the report API, the monthly snapshots, the filters
 * and both exports. Nothing else in the codebase may hardcode a
 * threshold; import from here so the table, the drawer, the summary
 * cards and the exported files always agree.
 *
 *   compliance %        status
 *   -------------------  ------------------
 *   < 75                needs_attention
 *   75 … below 86       needs_improvement
 *   86 and above        compliant
 *   required hours = 0  not_applicable
 *
 * Boundary note: exactly 75% is Needs Improvement (the gap between
 * "below 75" red and the old 76% lower bound is closed), and the
 * percentage itself is never capped at 100.
 */

export const COMPLIANT_MIN = 86;
export const NEEDS_IMPROVEMENT_MIN = 75;

export type ComplianceStatus =
  | "compliant"
  | "needs_improvement"
  | "needs_attention"
  | "not_applicable";

export const COMPLIANCE_STATUS_LABEL: Record<ComplianceStatus, string> = {
  compliant: "Compliant",
  needs_improvement: "Needs Improvement",
  needs_attention: "Needs Attention",
  not_applicable: "Not Applicable",
};

/**
 * The one status calculation. `requiredHours` of zero (or missing)
 * means the person has no requirement, which is Not Applicable — it
 * must never be reported as Compliant.
 */
export function getComplianceStatus(
  percent: number,
  requiredHours: number
): ComplianceStatus {
  if (!requiredHours || requiredHours <= 0) return "not_applicable";
  if (percent >= COMPLIANT_MIN) return "compliant";
  if (percent >= NEEDS_IMPROVEMENT_MIN) return "needs_improvement";
  return "needs_attention";
}

/** Compliance percentage, uncapped. Returns 0 when there is no requirement. */
export function compliancePercent(
  creditedHours: number,
  requiredHours: number
): number {
  if (!requiredHours || requiredHours <= 0) return 0;
  return (creditedHours / requiredHours) * 100;
}

/** Status colours — text / background pairs used by every report surface. */
export const COMPLIANCE_STATUS_STYLE: Record<
  ComplianceStatus,
  { text: string; bg: string; dot: string }
> = {
  compliant: {
    text: "var(--success)",
    bg: "var(--success-soft)",
    dot: "var(--success-solid)",
  },
  needs_improvement: {
    text: "var(--warning)",
    bg: "var(--warning-soft)",
    dot: "var(--warning-solid)",
  },
  needs_attention: {
    text: "var(--danger)",
    bg: "var(--danger-soft)",
    dot: "var(--danger-solid)",
  },
  not_applicable: {
    text: "var(--secondary-text)",
    bg: "var(--surface-2)",
    dot: "var(--border-strong)",
  },
};
