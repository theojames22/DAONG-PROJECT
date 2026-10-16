"use client";

import { ArrowRight, CheckCircle2, MinusCircle, TriangleAlert } from "lucide-react";
import { COMPLIANCE_STATUS_LABEL, COMPLIANCE_STATUS_STYLE } from "@/lib/report/constants";
import type { ReportRowView } from "@/lib/report/queries";
import { formatHoursValue } from "@/lib/report/calc";

/**
 * The report table — one row per eligible person, newest data first.
 * Scrolls horizontally inside its own card (minimum ~1260px) so the
 * layout never breaks on narrow screens.
 */

export interface ReportTableProps {
  rows: ReportRowView[];
  isFinalized: boolean;
  loading: boolean;
  viewerId: string;
  onOpenDetails: (row: ReportRowView, element: HTMLButtonElement | null) => void;
}

export default function ReportTable({
  rows,
  isFinalized,
  loading,
  viewerId,
  onOpenDetails,
}: ReportTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] font-medium text-[#5F6A80]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
        Loading report rows…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2F8] text-[#44506A]">
          <MinusCircle className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-[15px] font-bold text-[#0F1B33]">
          No personnel match these filters
        </h3>
      </div>
    );
  }

  const resultTag = isFinalized ? "Finalized" : "Provisional";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1260px] border-separate border-spacing-0 text-left text-[13px]">
        <thead>
          <tr>
            <th className="rounded-l-[12px] bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Employee / Head
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Position
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Days recorded
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Required hours
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Recorded hours
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Compliance %
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              <span className="flex items-center gap-2">
                Status
                <span className="rounded-full bg-[#EEF2F8] px-2 py-0.5 text-[10px] font-bold text-[#44506A]">
                  {resultTag}
                </span>
              </span>
            </th>
            <th className="bg-[#F3F7FE] px-4 py-3 text-[12px] font-semibold text-[#5F6A80]">
              Missing / incomplete
            </th>
            <th className="rounded-r-[12px] bg-[#F3F7FE] px-4 py-3 text-right text-[12px] font-semibold text-[#5F6A80]">
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const styles = COMPLIANCE_STATUS_STYLE[row.status];
            const isYou = row.employee_id === viewerId;
            const initial = (row.full_name?.trim() || "?").charAt(0).toUpperCase();
            const isNa = row.status === "not_applicable";

            return (
              <tr
                key={row.employee_id}
                className="animate-fade-in border-b border-[#E6EBF5] transition-colors last:border-b-0 hover:bg-[#F7FAFF]"
                style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
              >
                {/* Employee / Head */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E4EDFF] text-[12px] font-bold text-[#2563EB]"
                    >
                      {initial}
                    </span>
                    <span className="font-semibold text-[#0F1B33]">
                      {row.full_name || "Unnamed"}
                    </span>
                    {isYou && (
                      <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-[10px] font-bold text-white">
                        You
                      </span>
                    )}
                  </div>
                </td>

                {/* Position */}
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center rounded-full border border-[#D5E0F5] bg-[#F8FAFF] px-2.5 py-1 text-[11.5px] font-bold text-[#0F1B33]">
                    {row.position === "head" ? "Head" : "Staff"}
                  </span>
                </td>

                {/* Days recorded */}
                <td className="px-4 py-3.5 tabular-nums text-[#0F1B33]">
                  {row.days_recorded}{" "}
                  <span className="text-[#5F6A80]">/ {row.elapsed_working_days}</span>
                </td>

                {/* Required hours */}
                <td className="px-4 py-3.5 tabular-nums text-[#0F1B33]">
                  {isNa ? "—" : formatHoursValue(row.required_hours)}
                </td>

                {/* Recorded hours + credited beneath */}
                <td className="px-4 py-3.5">
                  <p className="font-semibold tabular-nums text-[#0F1B33]">
                    {formatHoursValue(row.recorded_hours)}
                  </p>
                  <p className="text-[11.5px] tabular-nums text-[#5F6A80]">
                    {isNa ? "—" : `${formatHoursValue(row.credited_hours)} credited`}
                  </p>
                </td>

                {/* Compliance % + bar */}
                <td className="px-4 py-3.5">
                  <p className="font-bold tabular-nums" style={{ color: styles.text }}>
                    {isNa ? "—" : `${row.compliance_percent.toFixed(1)}%`}
                  </p>
                  <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-[#EEF2F8]">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${isNa ? 0 : Math.max(0, Math.min(100, row.compliance_percent))}%`,
                        backgroundColor: styles.dot,
                      }}
                    />
                  </div>
                </td>

                {/* Status + regime tag */}
                <td className="px-4 py-3.5">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                    style={{ backgroundColor: styles.bg, color: styles.text }}
                  >
                    {COMPLIANCE_STATUS_LABEL[row.status]}
                  </span>
                  <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#5F6A80]">
                    {resultTag}
                  </p>
                </td>

                {/* Missing / incomplete */}
                <td className="px-4 py-3.5">
                  {isNa ? (
                    <span className="text-[#5F6A80]">—</span>
                  ) : row.missing_days === 0 && row.incomplete_records === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#DDF5E7] px-2.5 py-1 text-[11.5px] font-bold text-[#0F6A3C]">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      None
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.missing_days > 0 && (
                        <span className="inline-flex items-center rounded-full bg-[#FDE5E5] px-2.5 py-1 text-[11.5px] font-bold text-[#A82222]">
                          {row.missing_days} missing
                        </span>
                      )}
                      {row.incomplete_records > 0 && (
                        <span className="inline-flex items-center rounded-full bg-[#FFF0D1] px-2.5 py-1 text-[11.5px] font-bold text-[#8A5200]">
                          {row.incomplete_records} incomplete
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* Details */}
                <td className="px-4 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => onOpenDetails(row, e.currentTarget)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#E4EDFF] px-4 text-[12.5px] font-bold text-[#1D4ED8] transition-all hover:bg-[#2563EB] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#E1EBFF]"
                  >
                    Details
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
