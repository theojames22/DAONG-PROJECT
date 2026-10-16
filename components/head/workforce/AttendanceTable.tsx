"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Clock3, Hourglass, XCircle } from "lucide-react";
import { Profile, Session, Output } from "@/lib/types";
import { formatHours } from "@/lib/attendance";
import { OutputStatusPill } from "@/components/StatusPill";
import { createClient } from "@/lib/supabase/client";

export interface AttendanceRow {
  profile: Profile;
  // "active" = clocked in right now, "out" = clocked out, "none" = no time-in yet
  statusKind: "active" | "out" | "none";
  hoursToday: number;
  hoursWeek: number;
  requiredWeeklyHours: number;
  creditedHours?: number;
  sessions: Session[];
  outputs: Output[];
  latestOutput: {
    id?: string;
    title: string | null;
    status: Output["status"];
    reviewerName: string | null;
  } | null;
  outputCount: number;
}

const statusConfig = {
  active: {
    label: "Active On-Shift",
    pill: "bg-emerald-50 text-emerald-700 border border-emerald-100/60",
    dot: "bg-emerald-500",
  },
  out: {
    label: "Clocked Out",
    pill: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  none: {
    label: "Not Clocked In",
    pill: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
} as const;

function outputSubline(row: AttendanceRow) {
  if (!row.latestOutput) {
    return {
      icon: Hourglass,
      title: "No output uploaded",
      text: "Waiting for upload",
      tone: "text-slate-400",
    };
  }
  const { status, reviewerName } = row.latestOutput;
  if (status === "done") {
    return {
      icon: CheckCircle2,
      title: row.latestOutput.title || "Deliverable",
      text: reviewerName ? `Approved by ${reviewerName}` : "Approved",
      tone: "text-emerald-600",
    };
  }
  if (status === "checking") {
    return {
      icon: Clock3,
      title: row.latestOutput.title || "Deliverable",
      text: reviewerName ? `Reviewing by ${reviewerName}` : "In review",
      tone: "text-amber-600",
    };
  }
  if (status === "rejected") {
    return {
      icon: XCircle,
      title: row.latestOutput.title || "Deliverable",
      text: reviewerName ? `Rejected by ${reviewerName}` : "Rejected",
      tone: "text-rose-600",
    };
  }
  return {
    icon: Hourglass,
    title: row.latestOutput.title || "Deliverable",
    text: "Waiting for review",
    tone: "text-slate-400",
  };
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

type FilterTab = "all" | "active" | "none";

export default function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>("");

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

  // Update clock & live hours every 15s
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTimeStr(
        d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(() => {
      forceTick((t) => t + 1);
      updateTime();
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Filter calculations
  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.statusKind === "active").length,
      none: rows.filter((r) => r.statusKind === "none").length,
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (filter === "active") return rows.filter((r) => r.statusKind === "active");
    if (filter === "none") return rows.filter((r) => r.statusKind === "none");
    return rows;
  }, [rows, filter]);

  const defaultWeeklyTarget = rows[0]?.requiredWeeklyHours || 40.0;

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all animate-fade-in">
      {/* Top Bar inside Card: Filter Tabs on Left, Live indicator on Right */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 rounded-full bg-slate-100/80 p-1 w-fit">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              filter === "all"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>All</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200/90 text-slate-700"
              }`}
            >
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              filter === "active"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Active on-shift</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                filter === "active"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200/90 text-slate-700"
              }`}
            >
              {counts.active}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("none")}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              filter === "none"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Not clocked in</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                filter === "none"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200/90 text-slate-700"
              }`}
            >
              {counts.none}
            </span>
          </button>
        </div>

        {/* Live Indicator on Right */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span>
            Updates live {currentTimeStr ? `· ${currentTimeStr}` : ""}
          </span>
        </div>
      </div>

      {/* Table Headers */}
      <div className="hidden grid-cols-[1.5fr_1.1fr_1.2fr_1.3fr_1.4fr_auto] items-center gap-4 border-b border-slate-100 px-3 pt-4 pb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:grid">
        <span>Employee</span>
        <span>Status</span>
        <span>Hours today</span>
        <span>Weekly progress</span>
        <span>Output</span>
        <span className="w-20 text-right">Actions</span>
      </div>

      {/* Rows List */}
      <div className="flex flex-col divide-y divide-slate-100">
        {filteredRows.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No employees match the selected filter.
          </div>
        ) : (
          filteredRows.map((row) => {
            const cfg = statusConfig[row.statusKind];
            const sub = outputSubline(row);
            const SubIcon = sub.icon;

            const weekPct = Math.min(
              100,
              row.requiredWeeklyHours > 0
                ? (row.hoursWeek / row.requiredWeeklyHours) * 100
                : 0
            );

            const isOpen = expanded === row.profile.id;

            // Find current active session or first session
            const openSession = row.sessions.find((s) => !s.time_out);
            const firstSession = row.sessions[0];

            return (
              <div key={row.profile.id} className="group py-3.5 px-3 transition-colors hover:bg-slate-50/60">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpanded(isOpen ? null : row.profile.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setExpanded(isOpen ? null : row.profile.id);
                    }
                  }}
                  className="grid w-full grid-cols-1 items-center gap-4 text-left cursor-pointer lg:grid-cols-[1.5fr_1.1fr_1.2fr_1.3fr_1.4fr_auto]"
                >
                  {/* 1. Employee: Avatar + Name + Position + Chevron */}
                  <div className="flex min-w-0 items-center gap-3">
                    {row.profile.profile_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.profile.profile_picture_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-sm">
                        {initials(row.profile.full_name)}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {row.profile.full_name || "—"}
                      </p>
                      <p className="truncate text-xs text-slate-400 font-normal">
                        {row.profile.position || "staff"}
                      </p>
                    </div>

                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-blue-600" : ""
                      }`}
                    />
                  </div>

                  {/* 2. Status: Pill badge */}
                  <div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.pill}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* 3. Hours today: Bold hours + Subtext */}
                  <div>
                    {row.statusKind === "none" ? (
                      <span className="text-xs font-normal text-slate-400">
                        Pending attendance
                      </span>
                    ) : (
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {formatHours(row.hoursToday)}
                          <span className="ml-1 text-xs font-medium text-slate-400">
                            Today
                          </span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {openSession
                            ? `Since ${formatTime(openSession.time_in)}`
                            : firstSession
                            ? `Clocked in ${formatTime(firstSession.time_in)}`
                            : "Completed shift"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 4. Weekly progress: Ratio + Progress Bar */}
                  <div>
                    {row.statusKind === "none" && row.hoursWeek === 0 ? (
                      <span className="text-sm text-slate-400 font-normal">—</span>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          {row.hoursWeek.toFixed(1)} / {row.requiredWeeklyHours.toFixed(1)}h (
                          {Math.round(weekPct)}%)
                        </p>
                        <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all duration-500"
                            style={{ width: `${weekPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. Output: Title in blue bold + Subtext */}
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-xs font-bold text-blue-600">
                      {sub.title}
                    </p>
                    <p
                      className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${sub.tone}`}
                    >
                      <SubIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{sub.text}</span>
                      {row.outputCount > 1 && (
                        <span className="shrink-0 text-slate-400">
                          · {row.outputCount} total
                        </span>
                      )}
                    </p>
                  </div>

                  {/* 6. Action: Review Button */}
                  <div className="flex justify-end">
                    <Link
                      href={
                        row.latestOutput?.id
                          ? `/head/projects/${row.latestOutput.id}`
                          : "/head/projects"
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-blue-600 shadow-sm transition-all hover:bg-blue-50 hover:border-blue-200 active:scale-95"
                    >
                      Review
                    </Link>
                  </div>
                </div>

                {/* Expandable detail drawer — Sessions + Outputs */}
                {isOpen && (
                  <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 animate-fade-in">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Sessions
                    </p>
                    {row.sessions.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">No time-in recorded today.</p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {row.sessions.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between text-xs text-slate-700"
                          >
                            <span>
                              {formatTime(s.time_in)} –{" "}
                              {s.time_out ? formatTime(s.time_out) : "Still clocked in"}
                            </span>
                            <span className="font-medium text-slate-500">
                              {sessionDuration(s)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Outputs
                    </p>
                    {row.outputs.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">No deliverables uploaded.</p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {row.outputs.map((o) => (
                          <li
                            key={o.id}
                            className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-slate-100 text-xs"
                          >
                            <a
                              href={o.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {o.title || o.attachment_type}
                            </a>
                            <div className="flex items-center gap-2">
                              <OutputStatusPill status={o.status} />
                              <Link
                                href={`/head/projects/${o.id}`}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
                              >
                                Review
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Table Footer */}
      <div className="flex items-center justify-between border-t border-slate-100/80 pt-4 px-3 text-xs font-medium text-slate-400">
        <span>
          Showing {filteredRows.length} of {rows.length} employees
        </span>
        <span>
          Weekly target {defaultWeeklyTarget.toFixed(1)}h
        </span>
      </div>
    </div>
  );
}
