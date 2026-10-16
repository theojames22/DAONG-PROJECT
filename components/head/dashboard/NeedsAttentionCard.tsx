import { AlertTriangle, Check, AlertCircle } from "lucide-react";

export interface NeedsAttentionCardProps {
  count: number;
  /** Set when today's attendance/output read failed — the count is unknown. */
  error?: boolean;
}

/** Card 2 — Needs Attention summary card matching Image 2 */
export default function NeedsAttentionCard({ count, error = false }: NeedsAttentionCardProps) {
  const isClear = !error && count === 0;

  return (
    <section className="group relative flex flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 enter-up enter-d2">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Needs Attention
        </h2>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-500 transition-transform group-hover:scale-105 duration-300">
          <AlertTriangle className="h-4.5 w-4.5" strokeWidth={2.2} />
        </span>
      </div>

      {/* Main Count Figure */}
      <div className="my-3">
        <p className="text-6xl font-extrabold tracking-tight text-slate-900 tabular-nums">
          {error ? "—" : count}
        </p>
      </div>

      {/* Bottom Status Pill */}
      <div>
        {error ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3.5 py-1 text-xs font-medium text-rose-700">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" strokeWidth={2.5} />
            Unavailable
          </span>
        ) : isClear ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
            Missing output
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1 text-xs font-medium text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
            {count} {count === 1 ? "record missing output" : "records missing output"}
          </span>
        )}
      </div>
    </section>
  );
}
