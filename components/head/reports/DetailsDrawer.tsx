"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileOutput,
  Loader2,
  MinusCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  COMPLIANCE_STATUS_LABEL,
  COMPLIANCE_STATUS_STYLE,
  type ComplianceStatus,
} from "@/lib/report/constants";
import { ReportDayRow } from "@/lib/report/aggregate";
import {
  dayOfWeek,
  elapsedWorkingDays,
  formatHoursValue,
  formatReportDate,
  monthEndKey,
  monthStartKey,
  monthWorkingDays,
} from "@/lib/report/calc";

/**
 * Person report drawer — the attendance detail behind a table row.
 *
 * Accessibility: role="dialog" + aria-modal, closes on Escape,
 * backdrop click and the close button, keeps Tab focus inside while
 * open and returns focus to the Details button that opened it.
 *
 * The month's numbers, calendar and daily log all come from the same
 * payload the table uses: live rows for a provisional month, the frozen
 * snapshot for a finalized one, so a closed month can never silently
 * disagree with itself.
 */

export interface DrawerData {
  person: {
    id: string;
    full_name: string | null;
    position: string | null;
    required_weekly_hours: number;
  };
  row: {
    required_hours: number;
    recorded_hours: number;
    credited_hours: number;
    compliance_percent: number;
    status: ComplianceStatus;
    days_recorded: number;
    elapsed_working_days: number;
    working_days: number;
    missing_days: number;
    incomplete_records: number;
  };
  days: ReportDayRow[];
  isFinalized: boolean;
  finalizedAt: string | null;
  todayKey: string;
  timezone: string;
}

export interface DetailsDrawerProps {
  open: boolean;
  personId: string | null;
  personName: string;
  month: string;
  monthLabel: string;
  isFinalized: boolean;
  onClose: () => void;
  /** The Details button that opened the drawer — receives focus back. */
  openerRef: React.RefObject<HTMLButtonElement | null>;
}

type DayKind =
  | "credited"
  | "recorded"
  | "incomplete"
  | "missing"
  | "weekend"
  | "upcoming";

const DAY_STYLE: Record<DayKind, { bg: string; label: string; ring?: string }> = {
  credited: { bg: "#CDEEDB", label: "Recorded · output submitted" },
  recorded: { bg: "#DCE7FF", label: "Recorded · not credited" },
  incomplete: { bg: "#FFE4AE", label: "Incomplete · no time-out" },
  missing: { bg: "#F9D3D3", label: "Missing" },
  weekend: { bg: "#EEF2F8", label: "Weekend" },
  upcoming: { bg: "transparent", label: "Upcoming", ring: "dashed" },
};

const LEGEND: { kind: DayKind; label: string }[] = [
  { kind: "credited", label: "Recorded, output submitted" },
  { kind: "recorded", label: "Recorded, not credited" },
  { kind: "incomplete", label: "Incomplete" },
  { kind: "missing", label: "Missing" },
  { kind: "weekend", label: "Weekend" },
];

export default function DetailsDrawer({
  open,
  personId,
  personName,
  month,
  monthLabel,
  isFinalized,
  onClose,
  openerRef,
}: DetailsDrawerProps) {
  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ---- Load the person's report --------------------------------------
  useEffect(() => {
    if (!open || !personId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/reports/person?month=${month}&user_id=${personId}`
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load this report.");
        if (!cancelled) setData(body as DrawerData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load this report.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, personId, month]);

  // ---- Escape + focus trap + focus return ------------------------------
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    // Focus the close button so keyboard users land inside the dialog.
    closeButtonRef.current?.focus();
    const opener = openerRef.current;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = drawer!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Focus goes back to the button that opened the drawer.
      opener?.focus();
    };
  }, [open, onClose, openerRef]);

  if (!open) return null;

  const row = data?.row;
  const styles = row ? COMPLIANCE_STATUS_STYLE[row.status] : null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Blurred dark backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Attendance report for ${personName}`}
        className="relative z-10 flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-white shadow-2xl animate-drawer-in sm:rounded-l-[22px]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[#E6EBF5] bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E4EDFF] text-[15px] font-bold text-[#2563EB]"
              >
                {(personName || "?").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[16px] font-extrabold tracking-tight text-[#0F1B33]">
                  {personName}
                </h2>
                <p className="truncate text-[12.5px] text-[#5F6A80]">
                  {data?.person.position
                    ? `${data.person.position === "head" ? "Head" : "Staff"} · `
                    : ""}
                  {monthLabel}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {styles && row && (
                <span
                  className="rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                  style={{ backgroundColor: styles.bg, color: styles.text }}
                >
                  {COMPLIANCE_STATUS_LABEL[row.status]}
                </span>
              )}
              <span className="rounded-full bg-[#EEF2F8] px-2.5 py-1 text-[11.5px] font-bold text-[#44506A]">
                {isFinalized ? "Finalized" : "Provisional"}
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D5E0F5] text-[#5F6A80] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#E1EBFF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-6 px-5 py-5 sm:px-6">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] font-medium text-[#5F6A80]">
              <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" aria-hidden="true" />
              Loading report…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border border-[#F3C2C2] bg-[#FDE5E5] px-4 py-3 text-[13px] font-semibold text-[#A82222]">
              {error}
            </div>
          )}

          {data && row && !loading && (
            <>
              <StatTiles
                row={row}
                isFinalized={isFinalized}
                styles={styles!}
              />

              <MonthCalendar
                month={month}
                days={data.days}
                todayKey={data.todayKey}
                isFinalized={data.isFinalized}
              />

              <DailyLog
                month={month}
                days={data.days}
                todayKey={data.todayKey}
                isFinalized={data.isFinalized}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Stat tiles
// ---------------------------------------------------------------------

function StatTiles({
  row,
  isFinalized,
  styles,
}: {
  row: DrawerData["row"];
  isFinalized: boolean;
  styles: { text: string; bg: string; dot: string };
}) {
  const tiles = [
    {
      label: "Required hours",
      value: formatHoursValue(row.required_hours),
      note: isFinalized ? "for the full month" : "to date",
    },
    {
      label: "Recorded hours",
      value: formatHoursValue(row.recorded_hours),
      note: `${formatHoursValue(row.credited_hours)} credited`,
    },
    {
      label: "Days recorded",
      value: `${row.days_recorded} / ${row.elapsed_working_days}`,
      note: `${row.missing_days} missing · ${row.incomplete_records} incomplete`,
    },
    {
      label: "Compliance",
      value: `${row.compliance_percent.toFixed(1)}%`,
      note: "",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-[#D5E0F5] bg-white p-4"
        >
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-[#5F6A80]">
            {tile.label}
          </p>
          <p className="mt-1.5 text-[22px] font-black leading-none tracking-tight text-[#0F1B33]">
            {tile.value}
          </p>
          {tile.label === "Compliance" ? (
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#EEF2F8]">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.max(0, Math.min(100, row.compliance_percent))}%`,
                  backgroundColor: styles.dot,
                }}
              />
            </div>
          ) : (
            tile.note && <p className="mt-1.5 text-[11.5px] text-[#5F6A80]">{tile.note}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Month calendar
// ---------------------------------------------------------------------

function MonthCalendar({
  month,
  days,
  todayKey,
  isFinalized,
}: {
  month: string;
  days: ReportDayRow[];
  todayKey: string;
  isFinalized: boolean;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, ReportDayRow>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);

  // Monday-first grid covering the month.
  const cells = useMemo(() => {
    const start = new Date(`${monthStartKey(month)}T00:00:00Z`);
    const end = new Date(`${monthEndKey(month)}T00:00:00Z`);
    const leading = (dayOfWeek(monthStartKey(month)) + 6) % 7; // Monday = 0
    const firstGridDay = new Date(start);
    firstGridDay.setUTCDate(firstGridDay.getUTCDate() - leading);
    const trailing = (7 - ((dayOfWeek(monthEndKey(month)) + 1) % 7)) % 7;
    const lastGridDay = new Date(end);
    lastGridDay.setUTCDate(lastGridDay.getUTCDate() + trailing);

    const grid: string[] = [];
    const cursor = new Date(firstGridDay);
    while (cursor <= lastGridDay && grid.length < 42) {
      grid.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return grid;
  }, [month]);

  const classify = (dateKey: string): DayKind => {
    if (dayOfWeek(dateKey) === 0 || dayOfWeek(dateKey) === 6) return "weekend";
    const day = byDate.get(dateKey);
    if (day) {
      if (day.has_open_session) return "incomplete";
      return day.is_credited ? "credited" : "recorded";
    }
    if (isFinalized) return "missing";
    if (dateKey > todayKey || dateKey === todayKey) return "upcoming";
    return "missing";
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
        <h3 className="text-[14px] font-bold text-[#0F1B33]">Monthly calendar</h3>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#5F6A80]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateKey) => {
          const kind = classify(dateKey);
          const style = DAY_STYLE[kind];
          const dayNumber = Number(dateKey.slice(8, 10));
          const inMonth = dateKey.startsWith(month);
          const isToday = dateKey === todayKey;

          return (
            <div
              key={dateKey}
              title={`${formatReportDate(dateKey)} — ${style.label}`}
              className={`flex h-8 items-center justify-center rounded-md text-[10.5px] font-bold ${
                isToday ? "ring-2 ring-[#2563EB]" : ""
              } ${inMonth ? "text-[#0F1B33]" : "text-[#B4BFD4]"}`}
              style={{
                backgroundColor: kind === "upcoming" ? "transparent" : style.bg,
                border: kind === "upcoming" ? "1px dashed #CBD5E1" : undefined,
              }}
            >
              {dayNumber}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {LEGEND.map((item) => (
          <span
            key={item.kind}
            className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#5F6A80]"
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: DAY_STYLE[item.kind].bg }}
            />
            {item.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#5F6A80]">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#CBD5E1]" />
          Upcoming
        </span>
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#5F6A80]">
          <span className="h-2.5 w-2.5 rounded-sm ring-2 ring-[#2563EB]" />
          Today
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Daily log
// ---------------------------------------------------------------------

function DailyLog({
  month,
  days,
  todayKey,
  isFinalized,
}: {
  month: string;
  days: ReportDayRow[];
  todayKey: string;
  isFinalized: boolean;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, ReportDayRow>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);

  // Elapsed working days, newest first. A finalized month includes
  // every working day; the current month stops at yesterday.
  const entries = useMemo(() => {
    const elapsed = isFinalized
      ? monthWorkingDays(month)
      : elapsedWorkingDays(month, todayKey).days;
    return [...elapsed].reverse().map((dateKey) => ({
      dateKey,
      day: byDate.get(dateKey) ?? null,
    }));
  }, [month, todayKey, isFinalized, byDate]);

  const formatClock = (iso: string | null) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
        <h3 className="text-[14px] font-bold text-[#0F1B33]">Daily log</h3>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D5E0F5] px-4 py-6 text-center text-[12.5px] font-medium text-[#5F6A80]">
          No working days have passed in this month yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(({ dateKey, day }) => {
            const incomplete = day?.has_open_session ?? false;
            const attendanceChip = !day
              ? { label: "Missing", style: "bg-[#FDE5E5] text-[#A82222]" }
              : incomplete
                ? { label: "Incomplete", style: "bg-[#FFF0D1] text-[#8A5200]" }
                : { label: "Complete", style: "bg-[#DDF5E7] text-[#0F6A3C]" };

            const outputState = day?.output_status ?? "none";
            const outputChip = !day
              ? { label: "No output", style: "bg-[#EEF2F8] text-[#44506A]", icon: FileOutput }
              : outputState === "approved"
                ? { label: "Output approved", style: "bg-[#DDF5E7] text-[#0F6A3C]", icon: CheckCircle2 }
                : outputState === "pending"
                  ? { label: "Output pending", style: "bg-[#FFF0D1] text-[#8A5200]", icon: Clock }
                  : outputState === "rejected"
                    ? { label: "Output rejected", style: "bg-[#FDE5E5] text-[#A82222]", icon: FileOutput }
                    : { label: "No output", style: "bg-[#EEF2F8] text-[#44506A]", icon: FileOutput };

            const OutputIcon = outputChip.icon;

            return (
              <div
                key={dateKey}
                className="rounded-2xl border border-[#D5E0F5] bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-bold text-[#0F1B33]">
                    {formatReportDate(dateKey)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${attendanceChip.style}`}
                    >
                      {!day ? (
                        <MinusCircle className="h-3 w-3" aria-hidden="true" />
                      ) : incomplete ? (
                        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      )}
                      {attendanceChip.label}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${outputChip.style}`}
                    >
                      <OutputIcon className="h-3 w-3" aria-hidden="true" />
                      {outputChip.label}
                    </span>
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#5F6A80]">
                  <span>
                    In: <strong className="font-bold text-[#0F1B33]">{formatClock(day?.first_in ?? null) ?? "—"}</strong>
                  </span>
                  <span>
                    Out:{" "}
                    <strong className="font-bold text-[#0F1B33]">
                      {formatClock(day?.last_out ?? null) ??
                        (incomplete ? "no time-out" : "—")}
                    </strong>
                  </span>
                  <span>
                    Hours:{" "}
                    <strong className="font-bold text-[#0F1B33]">
                      {day && !day.has_open_session ? formatHoursValue(day.hours) : "—"}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
