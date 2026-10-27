"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { shiftDateKey } from "@/lib/compliance/helpers";
import type {
  ComplianceEmployee,
  WeeklyCompliancePayload,
} from "@/lib/compliance/types";
import ComplianceHeader, {
  type ComplianceHead,
} from "./ComplianceHeader";
import TeamComplianceCard from "./TeamComplianceCard";
import TeamHoursChart from "./TeamHoursChart";
import ComplianceRoster from "./ComplianceRoster";
import EmployeeDrawer from "./EmployeeDrawer";
import styles from "@/app/head/compliance/compliance.module.css";

export interface WeeklyComplianceProps {
  initial: WeeklyCompliancePayload;
  head: ComplianceHead;
}

/**
 * Weekly Compliance client shell.
 *
 * The first payload is server-rendered. Week changes and live refreshes come
 * from /api/head/compliance, which is the same builder, so search/filter
 * state survives navigation and the bars/rings transition rather than
 * remounting.
 */
export default function WeeklyCompliance({
  initial,
  head,
}: WeeklyComplianceProps) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<WeeklyCompliancePayload>(initial);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [animateBars, setAnimateBars] = useState(true);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const openerRef = useRef<HTMLButtonElement | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadingWeekRef = useRef(false);
  const errorWeekRef = useRef<string | null>(null);

  // Entrance animations play once. Start the window when the branded loader
  // hands over, otherwise a slow first paint could disable the row bars while
  // their entrance is still running. Filtering/search later must not replay
  // every bar from zero.
  useEffect(() => {
    const root = document.documentElement;
    let timer: number | undefined;
    let observer: MutationObserver | undefined;

    const schedule = () => {
      timer = window.setTimeout(() => setAnimateBars(false), 1600);
    };

    if (root.dataset.appReady === "true") {
      schedule();
    } else {
      observer = new MutationObserver(() => {
        if (root.dataset.appReady !== "true") return;
        observer?.disconnect();
        observer = undefined;
        schedule();
      });
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["data-app-ready"],
      });
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  const fetchWeek = useCallback(
    async (
      weekStart: string,
      options: { silent?: boolean; updateUrl?: boolean } = {}
    ) => {
      // A live refresh must never abort a week navigation that the user just
      // started; its payload would target the previous week.
      if (options.silent && loadingWeekRef.current) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options.silent) {
        loadingWeekRef.current = true;
        setLoadingWeek(true);
      }
      setError(null);

      try {
        const response = await fetch(
          `/api/head/compliance?week=${encodeURIComponent(weekStart)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = (await response.json()) as WeeklyCompliancePayload;
        if (requestIdRef.current !== requestId) return;

        errorWeekRef.current = null;
        setData(payload);
        setDrawerId((current) =>
          current && payload.employees.some((employee) => employee.id === current)
            ? current
            : null
        );

        if (options.updateUrl) {
          const nextUrl = payload.isCurrentWeek
            ? pathname
            : `${pathname}?week=${payload.weekStart}`;
          window.history.replaceState(null, "", nextUrl);
        }
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        if (requestIdRef.current !== requestId) return;
        console.error("Weekly compliance fetch failed:", fetchError);
        // Retry must target the week that failed, not the week still on screen.
        errorWeekRef.current = weekStart;
        setError(
          options.silent
            ? "Couldn't refresh. Showing the last loaded data."
            : "Couldn't load that week. Check your connection and try again."
        );
      } finally {
        if (requestIdRef.current === requestId) {
          loadingWeekRef.current = false;
          setLoadingWeek(false);
        }
      }
    },
    [pathname]
  );

  const refresh = useCallback(() => {
    void fetchWeek(data.weekStart, { silent: true });
  }, [data.weekStart, fetchWeek]);

  // Debounced realtime refresh. Subscribing per selected week keeps a closed
  // week's frozen credits from being needlessly re-fetched.
  useEffect(() => {
    setLiveConnected(false);
    let timer: number | undefined;

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 400);
    };

    const channel = supabase
      .channel(`compliance-live-${data.weekStart}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "outputs" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_days" },
        schedule
      )
      .subscribe((status) => {
        setLiveConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [data.weekStart, refresh, supabase]);

  // Open shifts change every minute. With no open shift, a slow fallback
  // still catches a missed realtime event without hammering the API.
  const hasOpenShift =
    data.isCurrentWeek && data.employees.some((employee) => employee.isOnClock);

  useEffect(() => {
    if (!data.isCurrentWeek) return;
    const interval = hasOpenShift ? 60_000 : 300_000;
    const timer = window.setInterval(() => void refresh(), interval);
    return () => window.clearInterval(timer);
  }, [data.isCurrentWeek, hasOpenShift, refresh]);

  const drawerEmployee =
    data.employees.find((employee) => employee.id === drawerId) ?? null;

  const openDrawer = useCallback(
    (employee: ComplianceEmployee, opener: HTMLButtonElement) => {
      openerRef.current = opener;
      setDrawerId(employee.id);
    },
    []
  );

  const closeDrawer = useCallback(() => setDrawerId(null), []);

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />

      <div className={styles.waves} aria-hidden="true">
        <svg
          className={styles.wavesSvg}
          viewBox="0 0 1440 360"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <path
              key={index}
              d="M0 90C220 20 380 160 620 100S1020 20 1240 90S1400 140 1440 110"
              transform={`translate(0 ${index * 28})`}
              fill="none"
              stroke="#C9D9F5"
              strokeWidth="1.2"
              opacity={0.55 - index * 0.05}
            />
          ))}
        </svg>
      </div>

      <div className={styles.content}>
        <ComplianceHeader
          data={data}
          head={head}
          loadingWeek={loadingWeek}
          onPrevious={() =>
            void fetchWeek(shiftDateKey(data.weekStart, -7), {
              updateUrl: true,
            })
          }
          onNext={() => {
            const next = shiftDateKey(data.weekStart, 7);
            if (next <= data.currentWeekStart) {
              void fetchWeek(next, { updateUrl: true });
            }
          }}
          onThisWeek={() =>
            void fetchWeek(data.currentWeekStart, { updateUrl: true })
          }
        />

        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button
              type="button"
              className={styles.errorRetry}
              onClick={() =>
                void fetchWeek(errorWeekRef.current ?? data.weekStart, {
                  updateUrl: true,
                })
              }
            >
              Retry
            </button>
          </div>
        )}

        <div className={styles.hero}>
          <TeamComplianceCard
            team={data.team}
            isCurrentWeek={data.isCurrentWeek}
            weekEndsAt={data.weekEndsAt}
            generatedAt={data.generatedAt}
          />
          <TeamHoursChart data={data} />
        </div>

        <div
          className={styles.rise}
          style={{ "--rise-delay": "0.16s" } as CSSProperties}
        >
          <ComplianceRoster
            data={data}
            liveConnected={liveConnected}
            animateBars={animateBars}
            onOpenEmployee={openDrawer}
          />
        </div>
      </div>

      {drawerEmployee && (
        <EmployeeDrawer
          employee={drawerEmployee}
          weekLabel={data.weekShortLabel}
          weekStart={data.weekStart}
          weekEnd={data.weekEnd}
          todayKey={data.todayKey}
          isCurrentWeek={data.isCurrentWeek}
          dailyBarScale={data.team.dailyBarScale}
          onClose={closeDrawer}
          openerRef={openerRef}
        />
      )}
    </div>
  );
}
