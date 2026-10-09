"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Clock3, Hourglass } from "lucide-react";
import { Profile, Session, Output } from "@/lib/types";
import { formatHours } from "@/lib/attendance";
import { OutputStatusPill } from "@/components/StatusPill";
import { createClient } from "@/lib/supabase/client";

export interface AttendanceRow {
  profile: Profile;
  // "active"   = clocked in right now, "out" = clocked out, "none" = no time-in yet
  statusKind: "active" | "out" | "none";
  hoursToday: number;
  hoursWeek: number;
  requiredWeeklyHours: number;
  sessions: Session[];
  outputs: Output[];
  latestOutput: {
    title: string | null;
    status: Output["status"];
    reviewerName: string | null;
  } | null;
  outputCount: number;
}

const statusConfig = {
  active: {
    label: "Active On-Shift",
    pill: "bg-success-soft text-success",
    dot: "bg-success status-dot-live",
  },
  out: {
    label: "Clocked Out",
    pill: "elev-pressed text-ink-muted",
    dot: "bg-ink-subtle",
  },
  none: {
    label: "Not Clocked In",
    pill: "elev-pressed text-ink-muted",
    dot: "bg-ink-subtle",
  },
} as const;

function outputSubline(row: AttendanceRow) {
  if (!row.latestOutput) {
    return { icon: Hourglass, text: "No Output Uploaded", tone: "text-ink-subtle" };
  }
  const { status, reviewerName } = row.latestOutput;
  if (status === "done") {
    return {
      icon: CheckCircle2,
      text: reviewerName ? `Approved by ${reviewerName}` : "Approved",
      tone: "text-success",
    };
  }
  if (status === "checking") {
    return {
      icon: Clock3,
      text: reviewerName ? `Reviewing by ${reviewerName}` : "In review",
      tone: "text-warning",
    };
  }
  return { icon: Hourglass, text: "Pending review", tone: "text-ink-subtle" };
}

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sessionDuration(s: Session) {
  const start = new Date(s.time_in).getTime();
  const end = s.time_out ? new Date(s.time_out).getTime() : Date.now();
  return formatHours((end - start) / 3_600_000);
}

export default function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  // Ticks every 15s so live hours advance for clocked-in staff.
  const [, forceTick] = useState(0);

  // Live updates: any scan, clock-in/out, or output upload re-fetches the page.
  useEffect(() => {
    const channel = supabase
      .channel("admin-attendance")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () =>
        router.refresh()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "outputs" }, () =>
        router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Column headers */}
      <div className="hidden grid-cols-[1.5fr_1.1fr_1.2fr_1.2fr_1.7fr] gap-4 px-4 pb-1 text-[11.5px] font-semibold uppercase tracking-wider text-ink-subtle lg:grid">
        <span>Employee</span>
        <span>Status</span>
        <span>Hours today</span>
        <span>Weekly progress</span>
        <span>Output</span>
      </div>

      {rows.map((row) => {
        const cfg = statusConfig[row.statusKind];
        const sub = outputSubline(row);
        const SubIcon = sub.icon;
        const weekPct = Math.min(
          100,
          row.requiredWeeklyHours > 0
            ? (row.hoursWeek / row.requiredWeeklyHours) * 100
            : 0
        );
        const metTarget = row.requiredWeeklyHours > 0 && row.hoursWeek >= row.requiredWeeklyHours;
        const isOpen = expanded === row.profile.id;

        return (
          <div
            key={row.profile.id}
            className="elev-1 neu-hover rounded-xl px-4 py-4"
          >
            {/* Whole row toggles the detail panel — content unchanged */}
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : row.profile.id)}
              aria-expanded={isOpen}
              className="neu-focus grid w-full grid-cols-1 items-center gap-4 rounded-md text-left lg:grid-cols-[1.5fr_1.1fr_1.2fr_1.2fr_1.7fr]"
            >
              {/* 1. Employee — name + position (no ID) */}
              <div className="flex min-w-0 items-center gap-3">
              {row.profile.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.profile.profile_picture_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 to-blue-500 text-[12.5px] font-bold text-white">
                  {initials(row.profile.full_name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-ink">
                  {row.profile.full_name || "—"}
                </p>
                <p className="truncate text-[12px] text-ink-muted">
                  {row.profile.position || "—"}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>

            {/* 2. Status — pill only, no subline */}
            <div>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold ${cfg.pill}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>

            {/* 3. Hours today + bar */}
            <div className="flex flex-col gap-1.5">
              {row.statusKind === "none" ? (
                <span className="text-[12.5px] text-ink-muted">Pending Attendance</span>
              ) : (
                <span className="text-[13.5px] font-bold text-ink">
                  {formatHours(row.hoursToday)}
                  <span className="ml-1 text-[11.5px] font-medium text-ink-muted">Today</span>
                </span>
              )}
              <div className="elev-pressed h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${row.statusKind === "none" ? 0 : weekPct}%` }}
                />
              </div>
            </div>

            {/* 4. Weekly progress */}
            <div>
              {row.statusKind === "none" ? (
                <span className="text-[12.5px] text-ink-muted">—</span>
              ) : (
                <span
                  className={`text-[13.5px] font-semibold ${
                    metTarget ? "text-success" : "text-ink"
                  }`}
                >
                  {row.hoursWeek.toFixed(1)} / {row.requiredWeeklyHours.toFixed(1)}h (
                  {Math.round(weekPct)}%)
                </span>
              )}
            </div>

            {/* 5. Output + approver + review button */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-bold text-accent-dark">
                  {row.latestOutput?.title || "No Output Uploaded"}
                </p>
                <p
                  className={`mt-0.5 flex items-center gap-1 text-[11.5px] font-medium ${sub.tone}`}
                >
                  <SubIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{sub.text}</span>
                  {row.outputCount > 1 && (
                    <span className="shrink-0 text-ink-subtle">
                      · {row.outputCount} total
                    </span>
                  )}
                </p>
              </div>

              <Link
                href="/admin/review"
                onClick={(e) => e.stopPropagation()}
                className="neu-icon-btn neu-focus shrink-0 rounded-full px-4 py-1.5 text-[12px] font-semibold text-accent-dark"
              >
                Review
              </Link>
              </div>
            </button>

            {/* Expandable detail — time-in/out sessions + outputs for the day */}
            {isOpen && (
              <div className="elev-pressed mt-4 rounded-lg px-4 py-4">
                <p className="text-[12px] font-medium text-ink-muted">Sessions</p>
                {row.sessions.length === 0 ? (
                  <p className="mt-1 text-[13px] text-ink-muted">No time-in recorded.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {row.sessions.map((s) => (
                      <li key={s.id} className="flex justify-between text-[13px] text-ink">
                        <span>
                          {formatTime(s.time_in)} –{" "}
                          {s.time_out ? formatTime(s.time_out) : "still clocked in"}
                        </span>
                        <span className="text-ink-muted">{sessionDuration(s)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-4 text-[12px] font-medium text-ink-muted">Outputs</p>
                {row.outputs.length === 0 ? (
                  <p className="mt-1 text-[13px] text-ink-muted">Nothing submitted.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {row.outputs.map((o) => (
                      <li key={o.id} className="flex items-center justify-between text-[13px]">
                        <a
                          href={o.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink underline decoration-base-dark underline-offset-2 hover:text-accent-dark"
                        >
                          {o.title || o.attachment_type}
                        </a>
                        <OutputStatusPill status={o.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
