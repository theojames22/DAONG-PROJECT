"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel("head-dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outputs" },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  return null;
}
