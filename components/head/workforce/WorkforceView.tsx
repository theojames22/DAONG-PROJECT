"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, LayoutGrid, List, Search } from "lucide-react";
import { Profile } from "@/lib/types";
import AttendanceTable, { type AttendanceRow } from "./AttendanceTable";
import DatePicker from "./DatePicker";
import EmployeeCards from "./EmployeeCards";
import WeeklyLeaderboard from "./WeeklyLeaderboard";
import styles from "@/app/head/workforce/workforce.module.css";

export interface WorkforceViewProps {
  /** Seeded from ?view= — Card View is the default. */
  initialView: "card" | "list";
  date: string;
  employees: Profile[];
  /** Credited hours for the current week (drives every progress bar). */
  creditedByEmployee: Record<string, number>;
  /** Actually recorded hours for the current week (shown as context only). */
  recordedByEmployee: Record<string, number>;
  activeEmployeeIds: string[];
  weekStart: string;
  weekEnd: string;
  attendanceRows: AttendanceRow[];
  timezone: string;
  /** Query failure text; when set the numbers below cannot be trusted. */
  loadError?: string | null;
}

/** Segmented Card/List switch. Client state only — switching never navigates. */
function ViewToggle({
  view,
  onChange,
}: {
  view: "card" | "list";
  onChange: (view: "card" | "list") => void;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label="View mode">
      <button
        type="button"
        onClick={() => onChange("card")}
        title="Card view"
        aria-label="Card view"
        aria-pressed={view === "card"}
        className={`${styles.segBtn} ${view === "card" ? styles.segBtnActive : ""}`}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        title="List view"
        aria-label="List view"
        aria-pressed={view === "list"}
        className={`${styles.segBtn} ${view === "list" ? styles.segBtnActive : ""}`}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The interactive half of the Workforce page.
 *
 * Card View (default): weekly summary + employee search + employee cards.
 * List View: date picker + the attendance table with filters, expandable
 * rows and Review actions.
 *
 * The active view lives in client state so switching re-renders instantly
 * (no reload, no navigation). Search text is kept here too, so it survives a
 * trip to List View and back.
 */
export default function WorkforceView({
  initialView,
  date,
  employees,
  creditedByEmployee,
  recordedByEmployee,
  activeEmployeeIds,
  weekStart,
  weekEnd,
  attendanceRows,
  timezone,
  loadError = null,
}: WorkforceViewProps) {
  const [view, setView] = useState<"card" | "list">(initialView);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((emp) => {
      const name = (emp.full_name || "").toLowerCase();
      const position = (emp.position || "").toLowerCase();
      const role = (emp.role || "").toLowerCase();
      return name.includes(query) || position.includes(query) || role.includes(query);
    });
  }, [employees, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          <span>
            Some workforce data couldn&rsquo;t be loaded, so these figures may be
            incomplete. {loadError}
          </span>
        </div>
      )}

      {view === "card" ? (
        <>
          {/* Weekly summary */}
          <div className={styles.enter} style={{ "--wf-delay": "0.06s" } as CSSProperties}>
            <WeeklyLeaderboard
              employees={employees}
              creditedByEmployee={creditedByEmployee}
              recordedByEmployee={recordedByEmployee}
              activeEmployeeIds={activeEmployeeIds}
              weekStart={weekStart}
              weekEnd={weekEnd}
            />
          </div>

          {/* Search + count + view switch */}
          <div
            className={`flex flex-wrap items-center justify-between gap-4 ${styles.enter}`}
            style={{ "--wf-delay": "0.12s" } as CSSProperties}
          >
            <div
              className={`relative flex w-full items-center rounded-full border border-slate-200/90 bg-white px-4 py-2.5 shadow-sm sm:w-80 ${styles.field}`}
            >
              <Search className="mr-2.5 h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or role"
                aria-label="Search employees"
                className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
              />
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-slate-500 sm:text-sm">
                Showing {filteredEmployees.length} of {employees.length}
              </span>
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>

          {/* Employee cards */}
          <EmployeeCards
            employees={filteredEmployees}
            creditedByEmployee={creditedByEmployee}
            recordedByEmployee={recordedByEmployee}
            activeEmployeeIds={activeEmployeeIds}
            searchQuery={searchQuery}
          />
        </>
      ) : (
        <>
          {/* Date + view switch */}
          <div
            className={`flex flex-wrap items-center justify-between gap-4 ${styles.enter}`}
            style={{ "--wf-delay": "0.06s" } as CSSProperties}
          >
            <DatePicker date={date} view="list" />
            <ViewToggle view={view} onChange={setView} />
          </div>

          {/* Attendance table */}
          <AttendanceTable rows={attendanceRows} timezone={timezone} />
        </>
      )}
    </div>
  );
}
