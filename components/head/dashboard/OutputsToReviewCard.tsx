import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

export interface OutputsToReviewCardProps {
  count: number;
}

/** Card 3 — Outputs to Review summary card matching Image 2 */
export default function OutputsToReviewCard({ count }: OutputsToReviewCardProps) {
  return (
    <section className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 p-6 text-white shadow-[0_8px_25px_-6px_rgba(37,99,235,0.4)] transition-all duration-300 hover:shadow-[0_12px_32px_-6px_rgba(37,99,235,0.5)] hover:-translate-y-0.5 enter-up enter-d3">
      {/* Decorative concentric arcs matching reference image */}
      <svg
        className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 opacity-20"
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="18" stroke="white" strokeWidth="2" />
        <circle cx="50" cy="50" r="32" stroke="white" strokeWidth="2" />
        <circle cx="50" cy="50" r="46" stroke="white" strokeWidth="2" />
      </svg>

      {/* Top Header */}
      <div className="relative flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
          Outputs to Review
        </h2>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm transition-transform group-hover:scale-105 duration-300">
          <FileText className="h-4.5 w-4.5" strokeWidth={2.2} />
        </span>
      </div>

      {/* Main Count Figure */}
      <div className="relative my-3">
        <p className="text-6xl font-extrabold tracking-tight text-white tabular-nums">
          {count}
        </p>
      </div>

      {/* Bottom Action Row */}
      <div className="relative flex items-center justify-between gap-3 pt-1">
        <p className="text-sm font-medium text-blue-100">
          Awaiting your review
        </p>

        <Link
          href="/head/projects"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-blue-600 shadow-md transition-all hover:bg-blue-50 hover:gap-2 active:scale-95 shrink-0"
        >
          Review output
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </section>
  );
}
