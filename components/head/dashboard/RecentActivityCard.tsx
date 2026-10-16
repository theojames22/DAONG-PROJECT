import { LogIn, LogOut, FileText } from "lucide-react";
import { OutputStatusPill } from "@/components/StatusPill";
import type { Output } from "@/lib/types";

export interface ActivityEmployee {
  id: string;
  full_name: string | null;
}

export interface RecentActivityCardProps {
  employees: ActivityEmployee[];
  sessions: {
    id: string;
    employee_id: string;
    time_in: string;
    time_out: string | null;
  }[];
  outputs: Output[];
  limit?: number;
}

type ActivityEvent = {
  key: string;
  at: string;
  employeeName: string;
  kind: "in" | "out" | "output";
  label: string;
  status?: Output["status"];
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Recent Activity card matching Image 2 */
export default function RecentActivityCard({
  employees,
  sessions,
  outputs,
  limit = 8,
}: RecentActivityCardProps) {
  const nameById = new Map(employees.map((e) => [e.id, e.full_name || "—"]));

  const events: ActivityEvent[] = [];

  for (const s of sessions) {
    const name = nameById.get(s.employee_id) ?? "—";
    events.push({
      key: `in-${s.id}`,
      at: s.time_in,
      employeeName: name,
      kind: "in",
      label: "Clocked in",
    });
    if (s.time_out) {
      events.push({
        key: `out-${s.id}`,
        at: s.time_out,
        employeeName: name,
        kind: "out",
        label: "Timed out",
      });
    }
  }

  for (const o of outputs) {
    if (!o.created_at) continue;
    events.push({
      key: `out-sub-${o.id}`,
      at: o.created_at,
      employeeName: nameById.get(o.employee_id) ?? "—",
      kind: "output",
      label: o.title?.trim() || "Submitted deliverable",
      status: o.status,
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const visible = events.slice(0, limit);

  const iconFor = (kind: ActivityEvent["kind"]) =>
    kind === "in" ? LogIn : kind === "out" ? LogOut : FileText;

  const toneFor = (kind: ActivityEvent["kind"]) =>
    kind === "in"
      ? "bg-emerald-50 text-emerald-600"
      : kind === "out"
      ? "bg-blue-50 text-blue-600"
      : "bg-slate-100 text-slate-600";

  return (
    <section className="group relative flex h-full flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.08)] animate-fade-in">
      {/* Top Header */}
      <div>
        <h2 className="text-base font-bold text-slate-900">Recent Activity</h2>
        <p className="mt-0.5 text-xs text-slate-500">Latest updates from the team.</p>
      </div>

      {/* Main Content Area */}
      {visible.length === 0 ? (
        /* Empty State with dashed border matching Image 2 */
        <div className="my-3 flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200/80 bg-slate-50/20 px-6 py-10 text-center transition-all group-hover:border-slate-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3 transition-transform group-hover:scale-105 duration-300">
            <FileText className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <p className="text-sm font-bold text-slate-800">
            Activity logs will appear here
          </p>
          <p className="mt-1 max-w-[280px] text-xs text-slate-500 leading-relaxed">
            Clock-ins, time-outs and submitted outputs show up as they happen.
          </p>
        </div>
      ) : (
        /* Populated feed */
        <ul className="my-3 flex flex-1 flex-col divide-y divide-slate-100 overflow-y-auto max-h-[300px]">
          {visible.map((event) => {
            const Icon = iconFor(event.kind);
            return (
              <li
                key={event.key}
                className="flex items-center gap-3 py-3 first:pt-1 last:pb-1 transition-colors hover:bg-slate-50/60 rounded-xl px-2"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${toneFor(
                    event.kind
                  )}`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {event.employeeName}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {event.kind === "output" ? (
                      <>Submitted &ldquo;{event.label}&rdquo;</>
                    ) : (
                      event.label
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {event.status && <OutputStatusPill status={event.status} />}
                  <span className="text-[10.5px] font-medium text-slate-400">
                    {relativeTime(event.at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bottom spacer for height balance */}
      <div className="h-2" aria-hidden="true" />
    </section>
  );
}
