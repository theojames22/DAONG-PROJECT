"use client";

import { CheckCircle2, TrendingUp, TriangleAlert, Users } from "lucide-react";
import type { ReportSummary } from "@/lib/report/queries";

/**
 * Four summary cards. All percentages are the share of TRACKED
 * personnel — Not Applicable people are excluded, and the three
 * status buckets partition the tracked set exactly.
 *
 * The percentage labels mirror the shared thresholds in
 * lib/report/constants.ts: ≥86% compliant, 75–85% needs
 * improvement, below 75% needs attention.
 */

const CARD_LABELS = {
  compliant: "86% or more",
  needs_improvement: "75%–85%",
  needs_attention: "Below 75%",
} as const;

export interface SummaryCardsProps {
  summary: ReportSummary;
  loading: boolean;
}

export default function SummaryCards({ summary, loading }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <TotalPersonnelCard summary={summary} loading={loading} />
      <StatusCard
        loading={loading}
        title="Compliant"
        count={summary.compliant.count}
        percent={summary.compliant.percent}
        label={CARD_LABELS.compliant}
        color="#0F6A3C"
        icon={CheckCircle2}
      />
      <StatusCard
        loading={loading}
        title="Needs Improvement"
        count={summary.needs_improvement.count}
        percent={summary.needs_improvement.percent}
        label={CARD_LABELS.needs_improvement}
        color="#8A5200"
        icon={TrendingUp}
      />
      <StatusCard
        loading={loading}
        title="Needs Attention"
        count={summary.needs_attention.count}
        percent={summary.needs_attention.percent}
        label={CARD_LABELS.needs_attention}
        color="#A82222"
        icon={TriangleAlert}
      />
    </div>
  );
}

function TotalPersonnelCard({
  summary,
  loading,
}: {
  summary: ReportSummary;
  loading: boolean;
}) {
  return (
    <article className="animate-fade-up rounded-[22px] border border-[#D5E0F5] bg-white p-5 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,27,61,0.05),0_16px_36px_rgba(37,99,235,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-semibold uppercase tracking-wider text-[#5F6A80]">
          Total personnel
        </p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E4EDFF] text-[#2563EB]">
          <Users className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3.5 text-[32px] font-black leading-none tracking-tight text-[#0F1B33]">
        {loading ? "—" : summary.total_eligible}
      </p>
      <p className="mt-2 text-[12.5px] text-[#5F6A80]">
        {loading
          ? "Loading…"
          : `${summary.tracked} tracked · ${summary.not_applicable} not applicable`}
      </p>
    </article>
  );
}

function StatusCard({
  title,
  count,
  percent,
  label,
  color,
  icon: Icon,
  loading,
}: {
  title: string;
  count: number;
  percent: number;
  label: string;
  color: string;
  icon: typeof CheckCircle2;
  loading: boolean;
}) {
  return (
    <article className="animate-fade-up rounded-[22px] border border-[#D5E0F5] bg-white p-5 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,27,61,0.05),0_16px_36px_rgba(37,99,235,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-semibold uppercase tracking-wider" style={{ color }}>
          {title}
        </p>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}14`, color }}
        >
          <Icon className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3.5 text-[32px] font-black leading-none tracking-tight" style={{ color }}>
        {loading ? "—" : `${percent}%`}
      </p>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#EEF2F8]"
        role="presentation"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${loading ? 0 : Math.max(0, Math.min(100, percent))}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <p className="mt-2 text-[12.5px] text-[#5F6A80]">
        {loading ? "Loading…" : `${count} ${count === 1 ? "person" : "people"} · ${label}`}
      </p>
    </article>
  );
}
