"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Session } from "@/lib/types";
import { totalHours, formatHours, toDateKey } from "@/lib/attendance";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TimeClock({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ticks every 30s so the live hours counter advances while clocked in.
  const [, forceTick] = useState(0);

  async function loadToday() {
    const today = toDateKey(new Date().toISOString());
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;

    const { data, error: fetchError } = await supabase
      .from("sessions")
      .select("id, employee_id, time_in, time_out")
      .eq("employee_id", employeeId)
      .gte("time_in", startOfDay)
      .lte("time_in", endOfDay)
      .order("time_in", { ascending: true });

    if (fetchError) {
      setError("Couldn't load today's sessions.");
    } else {
      setSessions((data ?? []) as Session[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const openSession = sessions.find((s) => !s.time_out) ?? null;
  const isClockedIn = !!openSession;
  const hoursToday = totalHours(sessions);

  async function handleClockIn() {
    setError(null);
    setIsSubmitting(true);
    const { error: insertError } = await supabase
      .from("sessions")
      .insert({ employee_id: employeeId, time_in: new Date().toISOString() });
    setIsSubmitting(false);
    if (insertError) {
      setError("Couldn't clock in. Try again.");
      return;
    }
    await loadToday();
    router.refresh();
  }

  async function handleClockOut() {
    if (!openSession) return;
    setError(null);
    setIsSubmitting(true);
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ time_out: new Date().toISOString() })
      .eq("id", openSession.id);
    setIsSubmitting(false);
    if (updateError) {
      setError("Couldn't clock out. Try again.");
      return;
    }
    await loadToday();
    router.refresh();
  }

  return (
    <div className="elev-3 animate-fade-up rounded-container p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-subtle">
            Today's attendance
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isClockedIn ? "bg-accent status-dot-live" : "bg-ink-subtle"
              }`}
            />
            <p className="text-[16px] font-bold text-ink">
              {loading ? "Loading…" : isClockedIn ? "Currently working" : "Not clocked in"}
            </p>
          </div>
        </div>

        <button
          onClick={isClockedIn ? handleClockOut : handleClockIn}
          disabled={isSubmitting || loading}
          className="btn-primary min-w-[140px]"
        >
          {isClockedIn ? (
            <Square className="h-4 w-4" strokeWidth={2.5} />
          ) : (
            <Play className="h-4 w-4" strokeWidth={2.5} />
          )}
          {isSubmitting ? "Saving…" : isClockedIn ? "Clock out" : "Clock in"}
        </button>
      </div>

      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[12px] text-ink-muted">Clock in</p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">
            {sessions[0] ? formatTime(sessions[0].time_in) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[12px] text-ink-muted">Clock out</p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">
            {isClockedIn
              ? "In progress"
              : sessions.length > 0 && sessions[sessions.length - 1].time_out
              ? formatTime(sessions[sessions.length - 1].time_out!)
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[12px] text-ink-muted">Hours worked</p>
          <p className="mt-0.5 text-[15px] font-semibold text-ink">{formatHours(hoursToday)}</p>
        </div>
      </div>

      {sessions.length > 1 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[12px] font-medium text-ink-muted">All sessions today</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {sessions.map((s) => (
              <li key={s.id} className="flex justify-between text-[13px] text-ink">
                <span>
                  {formatTime(s.time_in)} – {s.time_out ? formatTime(s.time_out) : "now"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
