import { formatHours } from "@/lib/attendance";
import { AlertTriangle, UserCheck } from "lucide-react";

export interface NeedsAttentionRow {
  id: string;
  full_name: string | null;
  position: string | null;
  profile_picture_url?: string | null;
  /** Today's completed sessions for this employee, oldest first. */
  sessions: { time_in: string; time_out: string | null }[];
  totalHours: number;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function timeOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const GRID = "grid-cols-[1.5fr_1fr_1fr_1fr]";

/**
 * Needs Attention card.
 *
 * Lists only Staff who clocked in AND out today but have not submitted an
 * output for today (the day status "unverified"). Anyone still on the clock,
 * absent, or with an output already submitted — pending, checking, done or
 * rejected — is excluded. On a data error it shows an error state instead of
 * a misleading "All clear".
 */
export default function NeedsAttentionTable({
  rows,
  error = false,
}: {
  rows: NeedsAttentionRow[];
  error?: boolean;
}) {
  const isClear = !error && rows.length === 0;

  const badgeClass = error
    ? "bg-rose-50 text-rose-600"
    : isClear
    ? "bg-emerald-50 text-emerald-600"
    : "bg-amber-50 text-amber-600";
  const dotClass = error ? "bg-rose-500" : isClear ? "bg-emerald-500" : "bg-amber-500";
  const badgeLabel = error ? "Unavailable" : isClear ? "All clear" : `${rows.length} pending`;

  return (
    <section className="group relative flex h-full flex-col justify-start rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.08)] enter-up enter-d5">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Needs attention</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Clocked in and out today but missing an output.
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
            {badgeLabel}
          </span>
        </div>

        {/* Table Header Row */}
        <div
          className={`mt-5 grid ${GRID} border-b border-slate-100 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400`}
        >
          <span>Employee</span>
          <span>Time in</span>
          <span>Time out</span>
          <span>Output</span>
        </div>
      </div>

      {/* Main Content Area */}
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertTriangle className="h-6 w-6" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-slate-800">Couldn&rsquo;t load this section</p>
          <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500">
            Something went wrong loading today&rsquo;s attendance. Please try again.
          </p>
        </div>
      ) : isClear ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500 transition-transform duration-300 group-hover:scale-105">
            <UserCheck className="h-6 w-6" strokeWidth={2} />
          </div>
          <p className="text-sm font-bold text-slate-800">Nothing to flag</p>
          <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500">
            Everyone who has clocked in and clocked out today has submitted their output.
          </p>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-slate-100 overflow-y-auto max-h-[300px]">
          {rows.map((row) => {
            const lastSession = row.sessions[row.sessions.length - 1];

            return (
              <div
                key={row.id}
                className={`grid ${GRID} items-center py-3 text-xs transition-colors hover:bg-slate-50/60`}
              >
                {/* Employee info */}
                <div className="flex min-w-0 items-center gap-2.5 pr-2">
                  {row.profile_picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.profile_picture_url}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">
                      {initials(row.full_name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {row.full_name || "—"}
                    </p>
                    <p className="truncate text-[10.5px] text-slate-400">
                      {row.position || "—"} · {formatHours(row.totalHours)}
                    </p>
                  </div>
                </div>

                {/* Time in */}
                <span className="text-slate-600">
                  {timeOnly(row.sessions[0]?.time_in ?? null)}
                </span>

                {/* Time out — every listed row has clocked out. */}
                <span className="text-slate-600">
                  {timeOnly(lastSession?.time_out ?? null)}
                </span>

                {/* Output — missing by definition for every listed row. */}
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span className="leading-tight">Missing output</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
