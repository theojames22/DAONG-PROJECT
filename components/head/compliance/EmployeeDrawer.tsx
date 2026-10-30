"use client";

import { useEffect, useId, useRef, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { formatHours } from "@/lib/attendance";
import {
  STATUS_META,
  remainingWorkdays,
} from "@/lib/compliance/helpers";
import type { ComplianceEmployee } from "@/lib/compliance/types";
import { useBodyScrollLock } from "@/components/shared/ModalShell";
import EmployeeAvatarRing from "./EmployeeAvatarRing";
import styles from "@/app/head/compliance/compliance.module.css";

export interface EmployeeDrawerProps {
  employee: ComplianceEmployee;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  todayKey: string;
  isCurrentWeek: boolean;
  dailyBarScale: number;
  onClose: () => void;
  /** The row button that opened this drawer — receives focus back. */
  openerRef: RefObject<HTMLButtonElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Employee compliance drawer.
 *
 * Accessibility mirrors the report drawer: role="dialog" + aria-modal,
 * Escape/backdrop close, Tab is kept inside, body scroll is locked and
 * focus returns to the row button that opened it. Values update in place
 * when a live refresh arrives.
 */
export default function EmployeeDrawer({
  employee,
  weekLabel,
  weekStart,
  weekEnd,
  todayKey,
  isCurrentWeek,
  dailyBarScale,
  onClose,
  openerRef,
}: EmployeeDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useBodyScrollLock(true);

  useEffect(() => {
    const previouslyFocused = openerRef.current;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((element) => element.offsetParent !== null || element === closeRef.current);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
    // Focus management runs once per open; live data changes must not steal
    // focus back to the close button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = STATUS_META[employee.status];
  const cap = Math.max(0, Math.min(100, employee.percent));
  const showMarker =
    isCurrentWeek &&
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

  const overTarget = employee.creditedHours - employee.requiredHours;
  const isOverTarget = employee.requiredHours > 0 && overTarget > 0.04;
  const remainingLabel = isOverTarget ? "Over target" : "Remaining";
  const remainingValue =
    employee.requiredHours <= 0
      ? "—"
      : isOverTarget
        ? `+${overTarget.toFixed(1)}h`
        : formatHours(employee.remainingHours);

  const daysLeft = isCurrentWeek
    ? remainingWorkdays(weekStart, weekEnd, todayKey)
    : 0;
  const firstName = employee.name.split(/\s+/)[0] || employee.name;
  let insight: string;

  if (employee.status === "no_target") {
    insight = `${employee.name} has no weekly hour requirement, so no compliance target is calculated.`;
  } else if (employee.status === "met") {
    insight =
      employee.creditedHours - employee.requiredHours > 0.04
        ? `Target met with ${(employee.creditedHours - employee.requiredHours).toFixed(
            1
          )}h over the ${formatHours(employee.requiredHours)} requirement. Nothing more is needed this week.`
        : `Target met with ${formatHours(employee.requiredHours)} credited. Nothing more is needed this week.`;
  } else if (!isCurrentWeek) {
    insight = `This week closed ${formatHours(
      employee.remainingHours
    )} short of the ${formatHours(employee.requiredHours)} requirement.`;
  } else if (daysLeft > 0) {
    const perDay = employee.remainingHours / daysLeft;
    insight = `To reach ${formatHours(
      employee.requiredHours
    )}, ${firstName} needs about ${perDay.toFixed(
      1
    )}h per workday across the ${daysLeft} remaining workday${
      daysLeft === 1 ? "" : "s"
    }, today included.`;
  } else {
    insight = `The workweek has ended with ${formatHours(
      employee.remainingHours
    )} still to reach the ${formatHours(
      employee.requiredHours
    )} requirement.`;
  }

  return createPortal(
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdropBtn}
        onClick={onClose}
        aria-label="Close employee details"
        tabIndex={-1}
      />

      <div
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerIdentity}>
            <EmployeeAvatarRing
              name={employee.name}
              initials={employee.initials}
              avatarUrl={employee.avatarUrl}
              percent={employee.percent}
              color={meta.dot}
              size={64}
              animate
            />
            <div className={styles.drawerHeading}>
              <h2 id={titleId} className={styles.drawerName}>
                {employee.name}
              </h2>
              <p className={styles.drawerMeta}>
                {employee.position} · {weekLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label="Close employee details"
            ref={closeRef}
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div
          className={styles.statusBand}
          style={{ background: meta.bg, color: meta.fg }}
        >
          <div className={styles.statusBandText}>
            <span className={styles.statusBandLabel}>
              {isCurrentWeek ? "Status this week" : "Week status"}
            </span>
            <span className={styles.statusBandValue}>
              {employee.statusLabel}
            </span>
          </div>
          <span
            className={styles.statusBandDot}
            style={{ background: meta.dot }}
            aria-hidden="true"
          />
        </div>

        <div className={styles.drawerStats}>
          <div className={styles.drawerStat}>
            <span className={styles.drawerStatLabel}>Logged</span>
            <span className={styles.drawerStatValue}>
              {formatHours(employee.loggedHours)}
            </span>
          </div>
          <div className={styles.drawerStat}>
            <span className={styles.drawerStatLabel}>Required</span>
            <span className={styles.drawerStatValue}>
              {employee.requiredHours > 0
                ? formatHours(employee.requiredHours)
                : "—"}
            </span>
          </div>
          <div className={styles.drawerStat}>
            <span className={styles.drawerStatLabel}>{remainingLabel}</span>
            <span className={styles.drawerStatValue}>{remainingValue}</span>
          </div>
        </div>

        <div className={styles.drawerProgress}>
          <div className={styles.drawerProgressHead}>
            <span>
              {employee.requiredHours > 0
                ? `${Math.round(employee.percent)}% of required credited`
                : "No required hours set"}
            </span>
            <span>
              {formatHours(employee.loggedHours)} logged ·{" "}
              {formatHours(employee.creditedHours)} credited
            </span>
          </div>
          <div
            className={styles.drawerProgressTrack}
            role="progressbar"
            aria-label="Credited hours progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              employee.requiredHours > 0 ? Math.round(cap) : undefined
            }
            aria-valuetext={
              employee.requiredHours > 0
                ? `${formatHours(
                    employee.creditedHours
                  )} of ${formatHours(employee.requiredHours)} credited${
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
              className={`${styles.barH} ${styles.drawerProgressFill}`}
              style={
                {
                  width: `${cap}%`,
                  background: meta.fill,
                } as CSSProperties
              }
            />
            {showMarker && (
              <span
                className={styles.drawerProgressMarker}
                style={{ left: `${marker}%` }}
                title={`Expected ${formatHours(employee.expectedHours)} so far`}
                aria-hidden="true"
              />
            )}
          </div>
          <p className={styles.drawerProgressNote}>
            Credited hours count only days with a submitted output.
          </p>
        </div>

        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHead}>
            <h3 className={styles.drawerSectionTitle}>Day by day</h3>
            <span className={styles.drawerSectionHint}>Logged hours</span>
          </div>

          <div className={styles.drawerDays}>
            {employee.days.map((day, index) => {
              const width =
                day.hours > 0
                  ? Math.max(
                      0,
                      Math.min(100, (day.hours / dailyBarScale) * 100)
                    )
                  : 0;

              return (
                <div
                  className={styles.drawerDay}
                  key={index}
                  style={
                    day.isToday ? { background: "#EEF4FF" } : undefined
                  }
                >
                  <span className={styles.drawerDayLabel}>
                    <span className={styles.drawerDayName}>
                      {day.label}
                      {day.isToday ? " · today" : ""}
                    </span>
                    <span className={styles.drawerDayDate}>
                      {day.dateLabel}
                    </span>
                  </span>

                  <div
                    className={styles.drawerDayTrack}
                    style={{
                      background: "#E6EEFB",
                    }}
                  >
                    {!day.isFuture && (
                      <div
                        className={`${styles.barH} ${styles.drawerDayFill}`}
                        style={
                          {
                            width: `${width}%`,
                            background:
                              "linear-gradient(90deg,#2563EB,#4C8BFF)",
                            "--bar-delay": `${0.06 + index * 0.04}s`,
                          } as CSSProperties
                        }
                      />
                    )}
                  </div>

                  <span
                    className={`${styles.drawerDayValue} ${
                      day.hasRecord ? styles.drawerDayValueActive : ""
                    }`}
                  >
                    {day.isFuture
                      ? "·"
                      : day.hasRecord
                        ? formatHours(day.hours)
                        : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className={styles.insight}>
          <Info size={18} strokeWidth={2.1} aria-hidden="true" />
          <p>{insight}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
