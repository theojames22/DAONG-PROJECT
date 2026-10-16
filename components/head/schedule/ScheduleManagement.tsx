"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Info,
  LayoutList,
  Loader2,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/attendance";
import { AvailabilityWithProfile, Profile } from "@/lib/types";
import LiveClockChip from "@/components/head/dashboard/LiveClockChip";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import ToastStack, { ToastData } from "@/components/ui/Toast";
import type { Theme } from "@/components/theme/ThemeProvider";

/** Status of one person's availability on one date. */
type DayStatus = "available" | "partial" | "unavailable" | "none";

const STATUS_STYLES: Record<
  DayStatus,
  { label: string; chip: string; dot: string; border: string }
> = {
  available: {
    label: "Available",
    chip: "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]",
    dot: "bg-[#22C55E]",
    border: "border-[#86EFAC]",
  },
  partial: {
    label: "Partially available",
    chip: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
    dot: "bg-[#F59E0B]",
    border: "border-[#FCD34D]",
  },
  unavailable: {
    label: "Unavailable",
    chip: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
    dot: "bg-[#EF4444]",
    border: "border-[#FCA5A5]",
  },
  none: {
    label: "No schedule submitted",
    chip: "bg-[#F1F5F9] text-[#55617F] border-[#E6EBF5]",
    dot: "bg-[#CBD5E1]",
    border: "border-[#E6EBF5]",
  },
};

interface Filters {
  user: string;
  position: string;
  status: string;
  date: string;
}

const EMPTY_FILTERS: Filters = { user: "", position: "", status: "", date: "" };

function formatTime12h(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minStr = m < 10 ? `0${m}` : `${m}`;
    return `${hour12}:${minStr} ${period}`;
  } catch {
    return timeStr;
  }
}

export interface ScheduleManagementProps {
  admin: {
    id: string;
    full_name: string | null;
    email: string | null;
    position: string | null;
    profile_picture_url: string | null;
    theme_preference?: string | null;
  };
}

/**
 * Head schedule calendar — everyone's availability, by month.
 *
 * Data comes from /api/head/availability (the `availability` table),
 * so entries submitted from the staff dashboards appear here.
 * The view is read-only for other people's schedules: only the owner
 * can edit their own availability.
 */
export default function ScheduleManagement({ admin }: ScheduleManagementProps) {
  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() =>
    toDateKey(new Date().toISOString())
  );

  const [people, setPeople] = useState<Profile[]>([]);
  const [rows, setRows] = useState<AvailabilityWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const loadRef = useRef<() => Promise<void>>(async () => {});

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const todayKey = useMemo(() => toDateKey(new Date().toISOString()), []);

  // ---- Fetch month data (with server-side filters) --------------------
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ month: monthKey });
      if (filters.user) params.set("user", filters.user);
      if (filters.position) params.set("position", filters.position);
      if (filters.status) params.set("status", filters.status);
      if (filters.date) params.set("date", filters.date);

      const res = await fetch(`/api/head/availability?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load schedules.");

      setPeople(body.people ?? []);
      setRows(body.data ?? []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load schedules."
      );
    } finally {
      setLoading(false);
    }
  }, [monthKey, filters]);

  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  // ---- Live updates: staff/head dashboards write to the same table ----
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-schedule-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "availability" },
        () => {
          loadRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const pushToast = useCallback(
    (type: "success" | "error", message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message }]);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- Derived data ----------------------------------------------------
  const rowsByDate = useMemo(() => {
    const map = new Map<string, AvailabilityWithProfile[]>();
    for (const row of rows) {
      const arr = map.get(row.date) ?? [];
      arr.push(row);
      map.set(row.date, arr);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [rows]);

  /** One person's status for a date: missing ≠ unavailable. */
  const personDayStatus = useCallback(
    (personId: string, dateKey: string): DayStatus => {
      const own = (rowsByDate.get(dateKey) ?? []).filter(
        (r) => r.employee_id === personId
      );
      if (own.length === 0) return "none";
      const hasAvailable = own.some((r) => r.status !== "unavailable");
      if (!hasAvailable) return "unavailable";
      const hasUnavailable = own.some((r) => r.status === "unavailable");
      return hasUnavailable ? "partial" : "available";
    },
    [rowsByDate]
  );

  /** Aggregate status for a date across everyone in view. */
  const dayAggregate = useCallback(
    (dateKey: string): DayStatus | null => {
      const dayRows = rowsByDate.get(dateKey);
      if (!dayRows || dayRows.length === 0) return null;
      const availablePeople = new Set(
        dayRows.filter((r) => r.status !== "unavailable").map((r) => r.employee_id)
      );
      const unavailablePeople = new Set(
        dayRows.filter((r) => r.status === "unavailable").map((r) => r.employee_id)
      );
      if (availablePeople.size === 0) return "unavailable";
      if (unavailablePeople.size === 0) return "available";
      return "partial";
    },
    [rowsByDate]
  );

  const selectedRows = rowsByDate.get(selectedDate) ?? [];

  const monthTitle = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [viewYear, viewMonth]
  );

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDayIndex = (firstDay.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: {
      dateKey: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      rows: AvailabilityWithProfile[];
      status: DayStatus | null;
    }[] = [];

    const push = (date: Date, isCurrentMonth: boolean) => {
      const dateKey = toDateKey(date.toISOString());
      cells.push({
        dateKey,
        dayNumber: date.getDate(),
        isCurrentMonth,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
        rows: rowsByDate.get(dateKey) ?? [],
        status: dayAggregate(dateKey),
      });
    };

    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = 0; i < startDayIndex; i++) {
      // Previous month's trailing days: new Date() normalises year
      // under/overflow (month -1 and +1) correctly.
      push(
        new Date(viewYear, viewMonth - 1, prevMonthDays - (startDayIndex - 1 - i)),
        false
      );
    }
    for (let d = 1; d <= daysInMonth; d++) {
      push(new Date(viewYear, viewMonth, d), true);
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= trailing; d++) {
      push(new Date(viewYear, viewMonth + 1, d), false);
    }
    return cells;
  }, [viewYear, viewMonth, todayKey, selectedDate, rowsByDate, dayAggregate]);

  const positions = useMemo(() => {
    const set = new Set<string>();
    for (const person of people) {
      if (person.position) set.add(person.position);
    }
    return Array.from(set).sort();
  }, [people]);

  const hasActiveFilters = Boolean(
    filters.user || filters.position || filters.status || filters.date
  );

  const listDates = useMemo(
    () => Array.from(rowsByDate.keys()).sort(),
    [rowsByDate]
  );

  const adminName = admin.full_name || "Head";

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayKey);
  };

  /**
   * Month navigation header (label + chevrons + Today). Rendered outside the
   * calendar/loading/empty states so the controls stay visible and usable for
   * every month — including months with no availability records.
   */
  const renderMonthNav = (heading: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-bold text-[#0F1B3D]">{heading}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="Previous month"
            className="neu-focus flex h-9 w-9 items-center justify-center rounded-xl border border-[#E6EBF5] text-[#55617F] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Next month"
            className="neu-focus flex h-9 w-9 items-center justify-center rounded-xl border border-[#E6EBF5] text-[#55617F] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={goToToday}
          className="neu-focus h-9 rounded-xl border border-[#E6EBF5] px-3 text-[12px] font-semibold text-[#0F1B3D] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          Today
        </button>
      </div>
      <span className="text-[12px] font-medium text-[#55617F]">
        {rows.length} {rows.length === 1 ? "entry" : "entries"} this month
      </span>
    </div>
  );

  return (
    <div className="relative flex flex-col gap-6 pb-24">
      {/* ============ Page header ============ */}
      <header className="relative z-30 flex flex-col gap-4 animate-fade-in pl-12 sm:pl-14 lg:pl-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mt-1 text-[40px] font-extrabold leading-tight tracking-tight text-[#0F1B3D]">
            Schedule management
          </h1>
          <p className="mt-1 max-w-xl text-sm font-normal text-[#55617F]">
            See when your team is available, based on the schedules they submit
            from their own dashboards.
          </p>
        </div>

        {/* View switcher + existing action cluster */}
        <div className="relative z-40 flex flex-wrap items-center gap-2.5 self-start pt-1">
          <LiveClockChip />
          <div className="inline-flex items-center rounded-full border border-[#E6EBF5] bg-white p-1 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors ${
                viewMode === "month"
                  ? "bg-[#2563EB] text-white"
                  : "text-[#55617F] hover:text-[#0F1B3D]"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors ${
                viewMode === "list"
                  ? "bg-[#2563EB] text-white"
                  : "text-[#55617F] hover:text-[#0F1B3D]"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
          </div>
          <NotificationBell
            userId={admin.id}
            userName={adminName}
            role="head"
            variant="flat"
          />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings & Preferences"
            aria-label="Settings & Preferences"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all hover:border-blue-200 hover:text-blue-600 hover:shadow-md active:scale-95"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* ============ Legend + read-only note ============ */}
      <section className="card-usage animate-fade-up flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          {(Object.keys(STATUS_STYLES) as DayStatus[]).map((key) => (
            <span
              key={key}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-[#55617F]"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[key].dot}`}
              />
              {STATUS_STYLES[key].label}
            </span>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-[#55617F]">
          <Info className="h-3.5 w-3.5 text-[#2563EB]" />
          Availability is not attendance — only each person can edit their own
          schedule.
        </p>
      </section>

      {/* ============ Filters ============ */}
      <section className="card-usage animate-fade-up grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <label
            htmlFor="schedule-filter-user"
            className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
          >
            Person
          </label>
          <select
            id="schedule-filter-user"
            value={filters.user}
            onChange={(e) =>
              setFilters((p) => ({ ...p, user: e.target.value }))
            }
            className="h-11 w-full cursor-pointer rounded-xl border border-[#E6EBF5] bg-white px-3.5 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
          >
            <option value="">All people</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name || "Unnamed"}
                {person.position ? ` — ${person.position}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="schedule-filter-position"
            className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
          >
            Position
          </label>
          <select
            id="schedule-filter-position"
            value={filters.position}
            onChange={(e) =>
              setFilters((p) => ({ ...p, position: e.target.value }))
            }
            className="h-11 w-full cursor-pointer rounded-xl border border-[#E6EBF5] bg-white px-3.5 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
          >
            <option value="">All positions</option>
            {positions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="schedule-filter-status"
            className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
          >
            Availability status
          </label>
          <select
            id="schedule-filter-status"
            value={filters.status}
            onChange={(e) =>
              setFilters((p) => ({ ...p, status: e.target.value }))
            }
            className="h-11 w-full cursor-pointer rounded-xl border border-[#E6EBF5] bg-white px-3.5 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
          >
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="schedule-filter-date"
            className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
          >
            Date
          </label>
          <div className="flex items-center gap-2">
            <input
              id="schedule-filter-date"
              type="date"
              value={filters.date}
              onChange={(e) => {
                setFilters((p) => ({ ...p, date: e.target.value }));
                if (e.target.value) {
                  const [y, m] = e.target.value.split("-").map(Number);
                  setViewYear(y);
                  setViewMonth(m - 1);
                  setSelectedDate(e.target.value);
                }
              }}
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#E6EBF5] bg-white px-3 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="neu-focus h-11 shrink-0 rounded-xl px-3 text-[12.5px] font-semibold text-[#2563EB] underline-offset-2 transition-colors hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ============ Calendar + day detail ============ */}
      {viewMode === "month" ? (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
          {/* Calendar */}
          <section className="card-usage animate-fade-up xl:col-span-8">
                {renderMonthNav(monthTitle)}

                {loadError ? (
                  <p className="mx-5 mb-5 rounded-2xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-[13px] font-semibold text-[#991B1B] sm:mx-6">
                    {loadError}
                  </p>
                ) : loading ? (
                  <div className="flex items-center justify-center gap-2 py-16">
                    <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                    <span className="text-[13px] font-medium text-[#55617F]">
                      Loading schedules
                    </span>
                  </div>
                ) : people.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E4EDFF] text-[#2563EB]">
                      <Users className="h-7 w-7" strokeWidth={1.75} />
                    </span>
                    <h3 className="mt-5 text-[15px] font-bold text-[#0F1B3D]">
                      No staff or heads to schedule
                    </h3>
                    <p className="mt-1.5 max-w-sm text-[13px] text-[#55617F]">
                      Add staff or head accounts from the Workforce page and
                      their availability will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    {rows.length === 0 && (
                      <div className="flex flex-col items-center px-6 pt-6 text-center">
                        <p className="max-w-sm text-[13px] leading-relaxed text-[#55617F]">
                          {hasActiveFilters
                            ? "No availability matches these filters. Try clearing them to see the whole month."
                            : "No availability has been submitted for this month. Saved schedules appear here automatically."}
                        </p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={() => setFilters(EMPTY_FILTERS)}
                            className="neu-focus mt-4 flex h-11 items-center rounded-full border border-[#E6EBF5] bg-[#E4EDFF] px-5 text-[13px] font-semibold text-[#1D4ED8] transition-colors hover:bg-[#D6E4FF]"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    )}

                    {/* Month grid */}
                <div className="overflow-x-auto px-3 pb-3 pt-4 sm:px-4">
                  <div className="min-w-[640px]">
                    <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wider text-[#55617F]">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                        (d) => (
                          <div key={d}>{d}</div>
                        )
                      )}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {calendarDays.map((cell) => {
                        const styles = cell.status
                          ? STATUS_STYLES[cell.status]
                          : STATUS_STYLES.none;
                        return (
                          <button
                            type="button"
                            key={cell.dateKey}
                            onClick={() => setSelectedDate(cell.dateKey)}
                            aria-label={`${cell.dateKey}${
                              cell.status ? `, ${styles.label}` : ""
                            }`}
                            className={`flex min-h-[88px] flex-col justify-between gap-1 rounded-2xl border p-2 text-left transition-all hover:shadow-sm ${
                              cell.isSelected
                                ? "border-[#2563EB] bg-[#EAF1FF] ring-2 ring-[#2563EB]/20"
                                : cell.isCurrentMonth
                                ? `bg-white ${styles.border} hover:bg-[#F8FAFC]`
                                : "border-transparent bg-[#F8FAFC]/60 opacity-70"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${
                                  cell.isToday
                                    ? "bg-[#2563EB] text-white"
                                    : cell.isCurrentMonth
                                    ? "text-[#0F1B3D]"
                                    : "text-[#94A3B8]"
                                }`}
                              >
                                {cell.dayNumber}
                              </span>
                              {cell.status && cell.isCurrentMonth && (
                                <span
                                  className={`h-2 w-2 rounded-full ${styles.dot}`}
                                  title={styles.label}
                                />
                              )}
                            </div>

                            {cell.rows.length > 0 ? (
                              <div className="hidden flex-col gap-1 sm:flex">
                                {cell.rows.slice(0, 2).map((row) => (
                                  <span
                                    key={row.id}
                                    className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                                      row.status === "unavailable"
                                        ? STATUS_STYLES.unavailable.chip
                                        : "border-[#2563EB]/20 bg-[#EAF1FF] text-[#2563EB]"
                                    }`}
                                    title={`${
                                      row.profile?.full_name || "Unknown"
                                    } · ${formatTime12h(row.start_time)} – ${formatTime12h(
                                      row.end_time
                                    )}`}
                                  >
                                    {row.profile?.full_name || "Unknown"}:{" "}
                                    {formatTime12h(row.start_time)}
                                  </span>
                                ))}
                                {cell.rows.length > 2 && (
                                  <span className="text-[9px] font-extrabold text-[#2563EB]">
                                    +{cell.rows.length - 2} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="hidden text-[9px] font-semibold text-[#94A3B8] sm:block">
                                {cell.isCurrentMonth ? "No schedules" : ""}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

              {/* Day detail */}
              <section className="card-usage animate-fade-up flex flex-col gap-4 xl:col-span-4">
                <div className="flex items-center justify-between border-b border-[#E6EBF5] px-5 pt-5 pb-3 sm:px-6">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                      Selected day
                    </span>
                    <h3 className="text-[15px] font-extrabold text-[#0F1B3D]">
                      {new Date(
                        `${selectedDate}T00:00:00`
                      ).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
                  {people.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-[#55617F]">
                      No people to show.
                    </p>
                  ) : (
                    people.map((person) => {
                      const status = personDayStatus(person.id, selectedDate);
                      const ownRows = (rowsByDate.get(selectedDate) ?? []).filter(
                        (r) => r.employee_id === person.id
                      );
                      const styles = STATUS_STYLES[status];
                      return (
                        <div
                          key={person.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-[#E6EBF5] bg-white px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-bold text-[#0F1B3D]">
                              {person.full_name || "Unnamed"}
                            </p>
                            <p className="truncate text-[11.5px] text-[#55617F]">
                              {person.position || "—"} ·{" "}
                              {ownRows.length > 0
                                ? ownRows
                                    .map(
                                      (r) =>
                                        `${formatTime12h(r.start_time)} – ${formatTime12h(r.end_time)}`
                                    )
                                    .join(", ")
                                : "No schedule submitted"}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles.chip}`}
                          >
                            {status === "none" ? "No schedule" : styles.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          ) : (
            /* ---- Detailed list view ---- */
            <section className="card-usage animate-fade-up overflow-hidden">
              {renderMonthNav(`Detailed list — ${monthTitle}`)}

              {loadError ? (
                <p className="mx-5 mb-5 rounded-2xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-[13px] font-semibold text-[#991B1B] sm:mx-6">
                  {loadError}
                </p>
              ) : loading ? (
                <div className="flex items-center justify-center gap-2 py-16">
                  <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                  <span className="text-[13px] font-medium text-[#55617F]">
                    Loading schedules
                  </span>
                </div>
              ) : people.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E4EDFF] text-[#2563EB]">
                    <Users className="h-7 w-7" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 text-[15px] font-bold text-[#0F1B3D]">
                    No staff or heads to schedule
                  </h3>
                  <p className="mt-1.5 max-w-sm text-[13px] text-[#55617F]">
                    Add staff or head accounts from the Workforce page and their
                    availability will appear here.
                  </p>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2563EB] text-white">
                    <CalendarDays className="h-7 w-7" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 text-[15px] font-bold text-[#0F1B3D]">
                    No schedules submitted yet
                  </h3>
                  <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#55617F]">
                    {hasActiveFilters
                      ? "No availability matches these filters. Try clearing them to see the whole month."
                      : "No availability has been submitted for this date. Saved schedules appear here automatically."}
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => setFilters(EMPTY_FILTERS)}
                      className="neu-focus mt-5 flex h-11 items-center rounded-full border border-[#E6EBF5] bg-[#E4EDFF] px-5 text-[13px] font-semibold text-[#1D4ED8] transition-colors hover:bg-[#D6E4FF]"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto px-2 pb-2 pt-4 sm:px-3">
                <table className="usage-table w-full min-w-[760px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-[#F3F7FE]">
                      <th className="rounded-l-xl px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Date
                      </th>
                      <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Person
                      </th>
                      <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Position
                      </th>
                      <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Time range
                      </th>
                      <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Duration
                      </th>
                      <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Status
                      </th>
                      <th className="rounded-r-xl px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listDates.flatMap((dateKey) =>
                      (rowsByDate.get(dateKey) ?? []).map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 font-medium text-[#0F1B3D]">
                            {new Date(`${dateKey}T00:00:00`).toLocaleDateString(
                              "en-US",
                              { weekday: "short", month: "short", day: "numeric" }
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E4EDFF] text-[11px] font-bold text-[#2563EB]"
                              >
                                {(
                                  row.profile?.full_name?.trim() || "?"
                                )
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                              <span className="font-medium text-[#0F1B3D]">
                                {row.profile?.full_name || "Unknown"}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#55617F]">
                            {row.profile?.position || "—"}
                          </td>
                          <td className="px-4 py-3 text-[#0F1B3D]">
                            {formatTime12h(row.start_time)} –{" "}
                            {formatTime12h(row.end_time)}
                          </td>
                          <td className="px-4 py-3 text-[#55617F]">
                            {(
                              (toMinutes(row.end_time) - toMinutes(row.start_time)) /
                              60
                            ).toFixed(1)}{" "}
                            hrs
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                                row.status === "unavailable"
                                  ? STATUS_STYLES.unavailable.chip
                                  : STATUS_STYLES.available.chip
                              }`}
                            >
                              {row.status === "unavailable"
                                ? "Unavailable"
                                : "Available"}
                            </span>
                          </td>
                          <td className="max-w-[200px] px-4 py-3 text-[#55617F]">
                            {row.notes ? (
                              <span className="block truncate">{row.notes}</span>
                            ) : (
                              <span className="text-[#94A3B8]">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-5 pb-5 sm:px-6">
                <p className="text-[12.5px] text-[#55617F]">
                  Showing {listDates.reduce(
                    (sum, d) => sum + (rowsByDate.get(d)?.length ?? 0),
                    0
                  )}{" "}
                  entries for {listDates.length}{" "}
                  {listDates.length === 1 ? "date" : "dates"}.
                </p>
              </div>
                </>
              )}
            </section>
      )}

      {/* ============ Faint wave lines ============ */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
        aria-hidden="true"
      >
        <svg
          className="animate-wave-drift h-36 w-[200%]"
          viewBox="0 0 1200 144"
          preserveAspectRatio="none"
          fill="none"
        >
          {[24, 52, 80, 108].map((y) => (
            <path
              key={y}
              d={`M0,${y} C100,${y - 22} 200,${y + 22} 300,${y} C400,${
                y - 22
              } 500,${y + 22} 600,${y} C700,${y - 22} 800,${y + 22} 900,${y} C1000,${y - 22} 1100,${y + 22} 1200,${y}`}
              stroke="#2563EB"
              strokeOpacity="0.06"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={admin.id}
        userName={adminName}
        userEmail={admin.email}
        userAvatarUrl={admin.profile_picture_url}
        initialTheme={(admin.theme_preference as Theme) ?? "light"}
        position={admin.position}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
