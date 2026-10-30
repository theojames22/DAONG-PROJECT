"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * A single clock-in can emit several realtime row events (insert on
 * `sessions`, then the triggers that touch `attendance_days`, plus one per
 * output linked to the day). Refreshing the server components once per event
 * made the dashboard re-render — and re-query Supabase — in bursts.
 *
 * 350 ms of trailing silence collapses a burst into one refresh without
 * delaying the visible update perceptibly: the event itself lands instantly,
 * the data is re-fetched once.
 */
const REFRESH_DEBOUNCE_MS = 350;

/**
 * Keeps the Head dashboard in sync with the database.
 *
 * The dashboard is a server component, so its data is fetched once per
 * render. This client component subscribes to Supabase Realtime on the
 * `sessions` and `outputs` tables (both already added to the
 * supabase_realtime publication — see supabase/attendance_qr.sql) and
 * refreshes the server components whenever a clock-in, clock-out or
 * output change lands. That way the Today's Attendance summary, the
 * progress ring, the "Who is on the clock" timeline, Needs Attention
 * and Recent Activity all update automatically after every attendance
 * event — no manual page reload required.
 */
export default function DashboardLiveSync() {
  const router = useRouter();
  // One client per mount. Creating it inline returned a new instance on every
  // render, so the subscription effect tore down and re-created the realtime
  // channel continuously.
  const supabase = useMemo(() => createClient(), []);
  const timerRef = useRef<number | undefined>(undefined);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [router]);

  useEffect(() => {
    const channel = supabase
      .channel("head-dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outputs" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      // Never leave a queued refresh behind after the dashboard unmounts —
      // a late refresh would re-render a route the user has already left.
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      supabase.removeChannel(channel);
    };
  }, [supabase, scheduleRefresh]);

  return null;
}
