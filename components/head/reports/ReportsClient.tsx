"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  SlidersHorizontal,
} from "lucide-react";
import {
  currentMonthKey,
  formatMonth,
  nextMonthKey,
  previousMonthKey,
} from "@/lib/report/calc";
import type { MonthReport, ReportFilters } from "@/lib/report/queries";
import type { Theme } from "@/components/theme/ThemeProvider";
import LiveClockChip from "@/components/head/dashboard/LiveClockChip";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import SummaryCards from "./SummaryCards";
import ReportTable from "./ReportTable";
import ExportMenu from "./ExportMenu";
import DetailsDrawer from "./DetailsDrawer";

/**
 * Reports page client — month navigation, filters, summary cards, the
 * report table and the details drawer.
 *
 * Data always comes from /api/reports/month (and /api/reports/person for
 * the drawer). The summary cards are computed on the server from the
 * employee + position filters only, so switching the compliance-status
 * filter never changes them — only the table.
 */

const INK = "#0F1B33";
const MUTED = "#5F6A80";
const BLUE = "#2563EB";

export interface ReportsClientProps {
  admin: {
    id: string;
    full_name: string | null;
    email: string | null;
    position: string | null;
    profile_picture_url: string | null;
    theme_preference?: string | null;
  };
}

const CONTROL_CLASS =
  "h-12 w-full rounded-[14px] border-[1.5px] border-[#D5E0F5] bg-white px-3.5 text-[13.5px] font-semibold text-[#0F1B33] outline-none transition-all hover:border-[#B9CCEE] focus:border-[#2563EB] focus:ring-4 focus:ring-[#E1EBFF] cursor-pointer";

const LABEL_CLASS = "mb-1.5 block text-[12px] font-semibold text-[#5F6A80]";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function ReportsClient({ admin }: ReportsClientProps) {
  const [report, setReport] = useState<MonthReport | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    month: "",
    employee: "",
    position: "",
    status: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [drawerPerson, setDrawerPerson] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const detailsButtonRef = useRef<HTMLButtonElement | null>(null);
  // Mirror of `filters` for the request builder above.
  const filtersRef = useRef<ReportFilters>({
    month: "",
    employee: "",
    position: "",
    status: "",
  });

  const load = useCallback(async (activeFilters: ReportFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeFilters.month) params.set("month", activeFilters.month);
      if (activeFilters.employee) params.set("employee", activeFilters.employee);
      if (activeFilters.position) params.set("position", activeFilters.position);
      if (activeFilters.status) params.set("status", activeFilters.status);

      const res = await fetch(`/api/reports/month?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load the report.");
      setReport(body as MonthReport);
      // Adopt the month the server resolved (defaults to the current one).
      const resolved = body.month as string;
      if (resolved && resolved !== filtersRef.current.month) {
        filtersRef.current = { ...filtersRef.current, month: resolved };
        setFilters((prev) => ({ ...prev, month: resolved }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    // Intentionally runs once on mount; filter changes go through load()
    // called by the handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilters = useCallback(
    (patch: Partial<ReportFilters>) => {
      // Keep the source of truth in a ref so the request always carries
      // the merged filters, and never fetches from inside a state
      // updater (which React may invoke twice).
      const next = { ...filtersRef.current, ...patch };
      filtersRef.current = next;
      setFilters(next);
      void load(next);
    },
    [load]
  );

  const month = report?.month ?? filters.month ?? currentMonthKey(new Date().toLocaleDateString("en-CA"));
  const monthLabel = report?.monthLabel ?? formatMonth(month);
  const isCurrentMonth = report?.isCurrentMonth ?? true;
  const isFinalized = report?.isFinalized ?? false;

  // en-CA formats as YYYY-MM-DD in the browser's local timezone, which
  // matches how the rest of the app groups days.
  const currentMonth = useMemo(
    () => currentMonthKey(new Date().toLocaleDateString("en-CA")),
    []
  );
  const [viewYear, viewMonthIndex] = month.split("-").map(Number);
  const yearOptions = useMemo(() => {
    const thisYear = Number(currentMonth.slice(0, 4));
    return Array.from({ length: 6 }, (_, i) => thisYear - i);
  }, [currentMonth]);

  const isNextDisabled = month >= currentMonth;

  const exportUrl = useCallback(
    (format: "csv" | "xls") => {
      const params = new URLSearchParams({ format });
      if (month) params.set("month", month);
      if (filters.employee) params.set("employee", filters.employee);
      if (filters.position) params.set("position", filters.position);
      if (filters.status) params.set("status", filters.status);
      return `/api/reports/export?${params.toString()}`;
    },
    [month, filters]
  );

  const adminName = admin.full_name || "Head";

  return (
    <div className="relative flex flex-col gap-6 pb-16">
      {/* ============ Page header ============ */}
      <header className="relative z-30 flex animate-fade-in flex-col gap-4 pl-12 sm:pl-14 lg:pl-0 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
            Monthly report
          </p>
          <h1 className="mt-1.5 text-[34px] font-black leading-tight tracking-tight sm:text-[40px]" style={{ color: INK }}>
            Reports
          </h1>
          <p className="mt-1.5 max-w-2xl text-[14px] font-medium" style={{ color: MUTED }}>
            Attendance hours and compliance for Staff, one month at a time.
          </p>
          <Link
            href="/head/compliance"
            className="mt-4 inline-flex h-12 items-center gap-2 rounded-full border border-[#D5E0F5] bg-white px-5 text-[13px] font-bold text-[#0F1B33] shadow-sm transition-all hover:border-[#2563EB] hover:text-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#E1EBFF]"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Weekly compliance
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start pt-1">
          <LiveClockChip />
          <NotificationBell userId={admin.id} userName={adminName} role="head" variant="flat" />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings & Preferences"
            aria-label="Settings & Preferences"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D5E0F5] bg-white text-[#5F6A80] shadow-sm transition-all hover:border-[#2563EB] hover:text-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#E1EBFF]"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ============ Provisional / Finalized banner ============ */}
      {report && (
        isCurrentMonth ? (
          <section
            className="animate-fade-up flex flex-col gap-3 rounded-[22px] border border-dashed p-5 sm:flex-row sm:items-start sm:gap-4"
            style={{ backgroundColor: "#FFF5E0", borderColor: "#EBC672" }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-[#8A5200]">
              <Clock className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-extrabold tracking-tight text-[#8A5200]">
                  Provisional results · {monthLabel}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8A5200] px-2.5 py-1 text-[11px] font-bold text-white">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  Provisional
                </span>
              </div>
              <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#8A5200]/90">
                These results count attendance through yesterday, and required hours are
                prorated to the working days that have elapsed so far. They stay live and
                provisional until the month ends and the related outputs are approved —
                the totals can still change.
              </p>
            </div>
          </section>
        ) : (
          <section
            className="animate-fade-up flex flex-col gap-3 rounded-[22px] border p-5 sm:flex-row sm:items-start sm:gap-4"
            style={{ backgroundColor: "#E7F6EE", borderColor: "#B8E3CB" }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-[#0F6A3C]">
              <Lock className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-extrabold tracking-tight text-[#0F6A3C]">
                  Finalized results · {monthLabel}
                </h2>
                <span className="rounded-full bg-[#0F6A3C] px-2.5 py-1 text-[11px] font-bold text-white">
                  Finalized
                </span>
              </div>
              <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#0F6A3C]/90">
                This month is closed and its results are locked to the frozen snapshot.
                Later output approvals, attendance corrections or requirement changes will
                not alter these figures — a re-finalization is the only way to change
                them, and it is versioned.
              </p>
            </div>
          </section>
        )
      )}

      {/* ============ Filter card ============ */}
      <section className="animate-fade-up rounded-[22px] border border-[#D5E0F5] bg-white p-5 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          {/* Reporting period */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateFilters({ month: previousMonthKey(month) })}
                aria-label="Previous month"
                className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.5px] border-[#D5E0F5] bg-white text-[#5F6A80] transition-all hover:border-[#2563EB] hover:text-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#E1EBFF]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => updateFilters({ month: nextMonthKey(month) })}
                disabled={isNextDisabled}
                aria-label="Next month"
                className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.5px] border-[#D5E0F5] bg-white text-[#5F6A80] transition-all hover:border-[#2563EB] hover:text-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#E1EBFF] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#D5E0F5] disabled:hover:text-[#5F6A80]"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div>
              <label htmlFor="report-month" className={LABEL_CLASS}>
                Month
              </label>
              <select
                id="report-month"
                value={viewMonthIndex}
                onChange={(e) =>
                  updateFilters({ month: `${viewYear}-${String(Number(e.target.value) + 1).padStart(2, "0")}` })
                }
                className={`${CONTROL_CLASS} w-[150px]`}
              >
                {MONTH_NAMES.map((name, index) => {
                  const optionMonth = `${viewYear}-${String(index + 1).padStart(2, "0")}`;
                  return (
                    <option key={name} value={index} disabled={optionMonth > currentMonth}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="report-year" className={LABEL_CLASS}>
                Year
              </label>
              <select
                id="report-year"
                value={viewYear}
                onChange={(e) =>
                  updateFilters({ month: `${e.target.value}-${String(viewMonthIndex).padStart(2, "0")}` })
                }
                className={`${CONTROL_CLASS} w-[110px]`}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Personnel filters + export */}
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="report-employee" className={LABEL_CLASS}>
                Employee
              </label>
              <select
                id="report-employee"
                value={filters.employee}
                onChange={(e) => updateFilters({ employee: e.target.value })}
                className={CONTROL_CLASS}
              >
                <option value="">All personnel</option>
                {(report?.people ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name || "Unnamed"} ({person.position === "head" ? "Head" : "Staff"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="report-position" className={LABEL_CLASS}>
                Position
              </label>
              <select
                id="report-position"
                value={filters.position}
                onChange={(e) => updateFilters({ position: e.target.value })}
                className={CONTROL_CLASS}
              >
                <option value="">All positions</option>
                <option value="staff">Staff</option>
                <option value="head">Head</option>
              </select>
            </div>

            <div>
              <label htmlFor="report-status" className={LABEL_CLASS}>
                Compliance status
              </label>
              <select
                id="report-status"
                value={filters.status}
                onChange={(e) => updateFilters({ status: e.target.value })}
                className={CONTROL_CLASS}
              >
                <option value="">All statuses</option>
                <option value="compliant">Compliant</option>
                <option value="needs_improvement">Needs Improvement</option>
                <option value="needs_attention">Needs Attention</option>
                <option value="not_applicable">Not Applicable</option>
              </select>
            </div>

            <div>
              <span className={LABEL_CLASS}>Export</span>
              <ExportMenu buildExportUrl={exportUrl} disabled={loading} />
            </div>
          </div>
        </div>
      </section>

      {/* ============ Load / error states ============ */}
      {loading && !report && (
        <div className="flex items-center justify-center gap-2 rounded-[22px] border border-[#D5E0F5] bg-white py-14 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" aria-hidden="true" />
          <span className="text-[13px] font-medium text-[#5F6A80]">Loading the monthly report…</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-[22px] border border-[#F3C2C2] bg-[#FDE5E5] px-5 py-4 text-[13px] font-semibold text-[#A82222]"
        >
          {error}
        </div>
      )}

      {/* ============ Summary cards ============ */}
      {report && <SummaryCards summary={report.summary} loading={loading} />}

      {/* ============ Report table ============ */}
      {report && (
        <section className="animate-fade-up rounded-[22px] border border-[#D5E0F5] bg-white p-5 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight text-[#0F1B33]">
                Attendance report · {monthLabel}
              </h2>
              <p className="mt-1 text-[12.5px] text-[#5F6A80]">
                Showing {report.rows.length} of {report.population.length} personnel ·{" "}
                {isCurrentMonth
                  ? "required hours prorated to date"
                  : "required hours for the full month"}
              </p>
            </div>
            <span className="rounded-full bg-[#EEF2F8] px-3 py-1.5 text-[11.5px] font-bold text-[#44506A]">
              {isFinalized ? "Finalized" : "Provisional"}
            </span>
          </div>

          <ReportTable
            rows={report.rows}
            isFinalized={isFinalized}
            loading={loading && !report}
            viewerId={admin.id}
            onOpenDetails={(row, element) => {
              // Remember the button so the drawer can return focus to it.
              detailsButtonRef.current = element ?? null;
              setDrawerPerson({
                id: row.employee_id,
                name: row.full_name || "Unnamed",
              });
            }}
          />

          {/* Footer legend + thresholds */}
          <div className="mt-5 flex flex-col gap-2 border-t border-[#E6EBF5] pt-4">
            <p className="text-[12px] leading-relaxed text-[#5F6A80]">
              Compliance = credited hours ÷ required hours. Only hours on days with an
              approved output are credited. Incomplete records (no time-out) are not
              counted until corrected.
            </p>
            <p className="text-[12px] font-semibold leading-relaxed text-[#0F1B33]">
              Compliant 86%+ · Needs Improvement 75%–below 86% · Needs Attention below
              75% · Not Applicable = no hours required
            </p>
          </div>
        </section>
      )}

      {/* ============ Details drawer ============ */}
      {drawerPerson && (
        <DetailsDrawer
          open
          personId={drawerPerson.id}
          personName={drawerPerson.name}
          month={month}
          monthLabel={monthLabel}
          isFinalized={isFinalized}
          onClose={() => setDrawerPerson(null)}
          openerRef={detailsButtonRef}
        />
      )}

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
    </div>
  );
}
