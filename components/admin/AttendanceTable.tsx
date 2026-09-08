"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Profile, Session, Output, DayStatus } from "@/lib/types";
import { formatHours } from "@/lib/attendance";
import { DayStatusPill, OutputStatusPill } from "@/components/StatusPill";
import EmptyState from "@/components/ui/EmptyState";

export interface AttendanceRow {
  profile: Profile;
  status: DayStatus;
  hours: number;
  sessions: Session[];
  outputs: Output[];
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
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No employees yet"
        description="Add your first employee from the Team page to see attendance here."
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1.6fr_1fr_0.8fr_1fr] gap-3 px-4 pb-3 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        <span>Name</span>
        <span>Status</span>
        <span>Hours</span>
        <span>Output</span>
      </div>

      {rows.map(({ profile, status, hours, sessions, outputs }) => {
        const isOpen = expanded === profile.id;
        return (
          <div key={profile.id} className="border-t border-border first:border-t-0">
            <button
              onClick={() => setExpanded(isOpen ? null : profile.id)}
              className="neu-focus grid w-full grid-cols-[1.6fr_1fr_0.8fr_1fr] items-center gap-3 rounded-md px-4 py-3.5 text-left transition-colors duration-150 hover:bg-accent-soft/50"
            >
              <span>
                <span className="block text-[14px] font-medium text-ink">
                  {profile.full_name || "—"}
                </span>
                <span className="block text-[12.5px] text-ink-muted">
                  {profile.position || "—"}
                </span>
              </span>
              <DayStatusPill status={status} />
              <span className="text-[14px] text-ink">{formatHours(hours)}</span>
              <span className="text-[13.5px] text-ink-muted">
                {outputs.length > 0 ? `${outputs.length} submitted` : "None"}
              </span>
            </button>

            {isOpen && (
              <div className="elev-pressed mx-4 mb-4 rounded-lg px-4 py-4">
                <p className="text-[12px] font-medium text-ink-muted">Sessions</p>
                {sessions.length === 0 ? (
                  <p className="mt-1 text-[13px] text-ink-muted">No time-in recorded.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {sessions.map((s) => (
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
                {outputs.length === 0 ? (
                  <p className="mt-1 text-[13px] text-ink-muted">Nothing submitted.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {outputs.map((o) => (
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
