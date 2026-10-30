"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search, Users } from "lucide-react";
import { formatHours } from "@/lib/attendance";
import { STATUS_META } from "@/lib/compliance/helpers";
import type {
  ComplianceEmployee,
  WeeklyCompliancePayload,
} from "@/lib/compliance/types";
import EmployeeAvatarRing from "./EmployeeAvatarRing";
import styles from "@/app/head/compliance/compliance.module.css";

type FilterKey = "all" | "attn" | "track" | "met";
type SortKey = "attn" | "low" | "high" | "name";

export interface ComplianceRosterProps {
  data: WeeklyCompliancePayload;
  liveConnected: boolean;
  animateBars: boolean;
  onOpenEmployee: (
    employee: ComplianceEmployee,
    opener: HTMLButtonElement
  ) => void;
}

const CURRENT_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attn", label: "Needs attention" },
  { key: "track", label: "On pace" },
  { key: "met", label: "Met" },
];

const PAST_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attn", label: "Short" },
  { key: "met", label: "Met" },
];

/**
 * Roster toolbar + seven-day row grid + accessible empty states.
 * Search and filter state intentionally survive week navigation; only an
 * invalid filter (e.g. "On pace" on a closed week) is reset to All.
 */
export default function ComplianceRoster({
  data,
  liveConnected,
  animateBars,
  onOpenEmployee,
}: ComplianceRosterProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("attn");

  const tabs = data.isCurrentWeek ? CURRENT_TABS : PAST_TABS;
  // A closed week has no "On pace" bucket. Treat that filter as All during
  // the render that follows week navigation instead of flashing an empty
  // roster before the reset effect runs.
  const activeFilter =
    !data.isCurrentWeek && filter === "track" ? "all" : filter;
  const counts = useMemo(() => {
    const result: Record<FilterKey, number> = {
      all: data.employees.length,
      attn: 0,
      track: 0,
      met: 0,
    };
    for (const employee of data.employees) {
      if (employee.statusGroup === "attn") result.attn += 1;
      if (employee.statusGroup === "track") result.track += 1;
      if (employee.statusGroup === "met") result.met += 1;
    }
    return result;
  }, [data.employees]);

  useEffect(() => {
    if (!data.isCurrentWeek && filter === "track") setFilter("all");
  }, [data.isCurrentWeek, filter]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = data.employees.filter((employee) => {
      if (activeFilter !== "all" && employee.statusGroup !== activeFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        employee.name.toLowerCase().includes(needle) ||
        employee.position.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "attn": {
          const rankA = STATUS_META[a.status].rank;
          const rankB = STATUS_META[b.status].rank;
          if (rankA !== rankB) return rankA - rankB;
          if (a.percent !== b.percent) return a.percent - b.percent;
          return a.name.localeCompare(b.name);
        }
        case "low":
          return a.creditedHours - b.creditedHours || a.name.localeCompare(b.name);
        case "high":
          return b.creditedHours - a.creditedHours || a.name.localeCompare(b.name);
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [activeFilter, data.employees, query, sort]);

  const isNoStaff = data.employees.length === 0;
  const emptyTitle = isNoStaff ? "No staff yet" : "No employees match";
  const emptyText = isNoStaff
    ? "Add staff from Workforce to start tracking weekly compliance."
    : query.trim()
      ? `No one matches “${query.trim()}” in this filter for this week.`
      : "No one is in this filter for this week.";

  const guide = data.isCurrentWeek
    ? "On pace means credited hours are at or above the expected progress for completed workdays. Behind pace is up to one workday short; At risk is more than one workday behind. The thin marker shows expected credited hours so far. Only days with a submitted output count as credited."
    : "Past weeks are Met or Short against each person's required hours. Weeks run Monday to Sunday. Progress counts credited hours — days with a submitted output — not raw attendance.";

  return (
    <section className={styles.roster} aria-labelledby="roster-heading">
      <h2 id="roster-heading" className={styles.srOnly}>
        Weekly compliance roster
      </h2>

      <div className={styles.toolbar}>
        <div
          className={styles.tabs}
          role="group"
          aria-label="Filter employees by compliance status"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${
                activeFilter === tab.key ? styles.tabOn : ""
              }`}
              aria-pressed={activeFilter === tab.key}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span className={styles.tabCount}>{counts[tab.key]}</span>
            </button>
          ))}
        </div>

        <div className={styles.tools}>
          <label className={styles.search}>
            <Search size={18} strokeWidth={2.1} aria-hidden="true" />
            <span className={styles.srOnly}>Search employees</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or role"
              className={styles.searchInput}
            />
          </label>

          <span className={styles.selectWrap}>
            <label className={styles.srOnly} htmlFor="compliance-sort">
              Sort employees
            </label>
            <select
              id="compliance-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className={styles.select}
            >
              <option value="attn">Needs attention first</option>
              <option value="low">Fewest hours first</option>
              <option value="high">Most hours first</option>
              <option value="name">Name A to Z</option>
            </select>
            <ChevronDown
              size={18}
              strokeWidth={2.2}
              className={styles.selectIcon}
              aria-hidden="true"
            />
          </span>
        </div>
      </div>

      <div
        className={styles.scrollX}
        role="region"
        aria-label="Weekly compliance roster table"
        tabIndex={0}
      >
        <div className={styles.grid}>
          <div className={`${styles.gridRow} ${styles.headGrid}`}>
            <span className={styles.colLabel}>Employee</span>

            <div className={styles.days7} aria-hidden="true">
              {data.days.map((day) => (
                <span className={styles.dayHead} key={day.key}>
                  <span
                    className={`${styles.dayHeadPill} ${
                      day.isToday ? styles.dayHeadPillToday : ""
                    }`}
                  >
                    {day.label}
                  </span>
                  <span className={styles.dayHeadDate}>{day.dateNumber}</span>
                </span>
              ))}
            </div>

            <span className={styles.colLabel}>Progress</span>
            <span className={styles.colLabel}>Status</span>
            <span aria-hidden="true" />
          </div>

          {rows.map((employee, index) => {
            const meta = STATUS_META[employee.status];
            const cap = Math.max(0, Math.min(100, employee.percent));
            const showMarker =
              data.isCurrentWeek &&
              employee.requiredHours > 0 &&
              employee.expectedHours > 0.0001 &&
              employee.expectedHours < employee.requiredHours - 0.0001;
            const marker = showMarker
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    (employee.expectedHours / employee.requiredHours) * 100
                  )
                )
              : 0;
            const captionColor =
              employee.status === "met"
                ? "#0F6A3C"
                : employee.status === "behind"
                  ? "#8A5200"
                  : employee.status === "at_risk" ||
                      employee.status === "short"
                    ? "#A82222"
                    : "#5F6A80";

            return (
              <div
                className={`${styles.gridRow} ${styles.crow}`}
                key={employee.id}
              >
                <button
                  type="button"
                  className={styles.nameBtn}
                  onClick={(event) =>
                    onOpenEmployee(employee, event.currentTarget)
                  }
                  aria-label={`View ${employee.name}'s compliance details${
                    employee.isOnClock ? ", currently on the clock" : ""
                  }`}
                >
                  <EmployeeAvatarRing
                    name={employee.name}
                    initials={employee.initials}
                    avatarUrl={employee.avatarUrl}
                    percent={employee.percent}
                    color={meta.dot}
                    animate={animateBars}
                  />
                  <span className={styles.nameText}>
                    <span className={styles.name}>{employee.name}</span>
                    <span className={styles.role}>{employee.position}</span>
                    {employee.isOnClock && (
                      <span className={styles.onClock}>
                        <span
                          className={`${styles.liveDot} ${styles.onClockDot}`}
                          aria-hidden="true"
                        />
                        On the clock
                      </span>
                    )}
                  </span>
                </button>

                <div
                  className={styles.days7}
                  role="group"
                  aria-label={`${employee.name}'s daily hours`}
                >
                  {employee.days.map((day, dayIndex) => {
                    const height =
                      day.hours > 0
                        ? Math.max(
                            0,
                            Math.min(
                              100,
                              (day.hours / data.team.dailyBarScale) * 100
                            )
                          )
                        : 0;
                    const dayDescription = `${day.label} ${day.dateLabel}: ${
                      day.isFuture
                        ? "upcoming"
                        : day.hours > 0
                          ? formatHours(day.hours)
                          : "no hours"
                    }`;
                    return (
                      <div
                        className={`${styles.dayCell} ${
                          day.isToday ? styles.dayCellToday : ""
                        }`}
                        key={dayIndex}
                        title={dayDescription}
                        role="img"
                        aria-label={dayDescription}
                      >
                        <div
                          className={styles.miniTrack}
                          style={{ background: "#E9EFFA", border: "0" }}
                        >
                          {!day.isFuture && (
                            <div
                              className={`${styles.barV} ${
                                styles.miniBar
                              } ${animateBars ? "" : styles.noAnim}`}
                              style={
                                {
                                  height: `${height}%`,
                                  background: day.isToday
                                    ? "linear-gradient(180deg,#4C8BFF,#1D4FD8)"
                                    : "linear-gradient(180deg,#7FA8FF,#2563EB)",
                                  "--bar-delay": `${
                                    0.15 +
                                    Math.min(index, 8) * 0.035 +
                                    dayIndex * 0.025
                                  }s`,
                                } as CSSProperties
                              }
                            />
                          )}
                        </div>
                        <span
                          className={`${styles.miniLabel} ${
                            day.hasRecord ? styles.miniLabelActive : ""
                          }`}
                        >
                          {day.isFuture
                            ? "·"
                            : day.hasRecord
                              ? day.hours.toFixed(1)
                              : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.progressCell}>
                  <div className={styles.progressNums}>
                    <span className={styles.progressTotal}>
                      {formatHours(employee.creditedHours)}
                    </span>
                    <span className={styles.progressRequired}>
                      /{" "}
                      {employee.requiredHours > 0
                        ? formatHours(employee.requiredHours)
                        : "—"}
                    </span>
                  </div>

                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-label={`${employee.name} credited hours`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={
                      employee.requiredHours > 0 ? Math.round(cap) : undefined
                    }
                    aria-valuetext={
                      employee.requiredHours > 0
                        ? `${formatHours(
                            employee.creditedHours
                          )} of ${formatHours(
                            employee.requiredHours
                          )} credited${
                            showMarker
                              ? `; expected ${formatHours(
                                  employee.expectedHours
                                )} so far`
                              : ""
                          }`
                        : `${formatHours(
                            employee.creditedHours
                          )} credited; no weekly target`
                    }
                  >
                    <div
                      className={`${styles.barH} ${styles.progressFill} ${
                        animateBars ? "" : styles.noAnim
                      }`}
                      style={
                        {
                          width: `${cap}%`,
                          background: meta.fill,
                          "--bar-delay": `${
                            0.2 + Math.min(index, 8) * 0.03
                          }s`,
                        } as CSSProperties
                      }
                    />
                    {showMarker && (
                      <span
                        className={styles.paceMarker}
                        style={{ left: `${marker}%` }}
                        title={`Expected ${formatHours(
                          employee.expectedHours
                        )} so far`}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <span
                    className={styles.caption}
                    style={{ color: captionColor }}
                  >
                    {employee.caption}
                  </span>
                </div>

                <div className={styles.statusCell}>
                  <span
                    className={styles.statusPill}
                    style={{ background: meta.bg, color: meta.fg }}
                  >
                    <span
                      className={styles.statusDot}
                      style={{ background: meta.dot }}
                      aria-hidden="true"
                    />
                    {employee.statusLabel}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.chev}
                  onClick={(event) =>
                    onOpenEmployee(employee, event.currentTarget)
                  }
                  aria-label={`View ${employee.name}'s compliance details`}
                >
                  <ChevronRight size={20} strokeWidth={2.4} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {rows.length === 0 && (
        <div className={`${styles.empty} ${styles.pop}`}>
          <span className={styles.emptyIcon} aria-hidden="true">
            {isNoStaff ? <Users size={28} /> : <Search size={28} />}
          </span>
          <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
          <p className={styles.emptyText}>{emptyText}</p>
          {isNoStaff ? (
            <Link href="/head/workforce" className={styles.emptyAction}>
              Go to Workforce
            </Link>
          ) : (
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear search and filters
            </button>
          )}
        </div>
      )}

      <footer className={styles.rosterFooter}>
        <span className={styles.footerLive} role="status">
          {liveConnected ? (
            <>
              <span
                className={`${styles.liveDot} ${styles.footerDot}`}
                aria-hidden="true"
              />
              Updates live as staff clock in and out
            </>
          ) : (
            "Live updates unavailable — refresh to see the latest"
          )}
        </span>
        <span className={styles.footerGuide}>{guide}</span>
      </footer>
    </section>
  );
}
