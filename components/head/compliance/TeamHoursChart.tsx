"use client";

import type { CSSProperties } from "react";
import { formatHours } from "@/lib/attendance";
import { formatSignedGap } from "@/lib/compliance/helpers";
import type { WeeklyCompliancePayload } from "@/lib/compliance/types";
import styles from "@/app/head/compliance/compliance.module.css";

export interface TeamHoursChartProps {
  data: WeeklyCompliancePayload;
}

/**
 * Team hours by day. These are real session hours (including an open shift
 * up to the fetch time), while the ring/cards above use credited hours.
 * Every day uses the same track; future days simply have no bar yet. The
 * thin dashed line is the team's combined daily target.
 */
export default function TeamHoursChart({ data }: TeamHoursChartProps) {
  const { team, days, isCurrentWeek } = data;
  const hasTargets = team.requiredHours > 0;
  const maxDay = Math.max(...team.dailyTotals, 0);
  const scale = Math.max(team.dailyTarget * 1.2, maxDay * 1.1, 1);
  const targetPct =
    team.dailyTarget > 0 ? (team.dailyTarget / scale) * 100 : null;

  const subtitle =
    team.staffCount <= 0
      ? "No staff to chart yet"
      : team.trackedCount <= 0
        ? "No weekly targets set"
        : team.uniformDailyTarget !== null
          ? `Daily target is ${team.trackedCount} × ${formatHours(
              team.uniformDailyTarget
            )} on workdays`
          : `Daily target is ${formatHours(
              team.dailyTarget
            )} across ${team.trackedCount} tracked staff on workdays`;

  const ariaLabel = days
    .map((day, index) => {
      const hours = team.dailyTotals[index] ?? 0;
      return day.isFuture
        ? `${day.label} ${day.dateLabel}: upcoming`
        : `${day.label} ${day.dateLabel}: ${formatHours(hours)} logged`;
    })
    .join(". ");

  const expectedLabel = isCurrentWeek
    ? "Expected through yesterday"
    : "Expected for the week";
  const gapPositive = team.gapHours >= 0;

  return (
    <section
      className={`${styles.chartCard} ${styles.rise}`}
      style={{ "--rise-delay": "0.1s" } as CSSProperties}
      aria-labelledby="team-hours-heading"
    >
      <div className={styles.chartHead}>
        <div>
          <h2 id="team-hours-heading" className={styles.chartTitle}>
            Team hours by day
          </h2>
          <span className={styles.chartSub}>{subtitle}</span>
        </div>

        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}>
            <i className={styles.legendSwatch} />
            Logged
          </span>
          <span className={styles.legendItem}>
            <i className={styles.legendDash} />
            Daily target
          </span>
        </div>
      </div>

      <div className={styles.chartGrid} role="img" aria-label={ariaLabel}>
        {days.map((day, index) => {
          const hours = team.dailyTotals[index] ?? 0;
          const height = day.isFuture
            ? 0
            : Math.max(0, Math.min(100, (hours / scale) * 100));
          const fill = day.isToday
            ? "linear-gradient(180deg,#4C8BFF,#1D4FD8)"
            : "linear-gradient(180deg,#7FA8FF,#2563EB)";

          return (
            <div className={styles.chartCol} key={index}>
              <span
                className={styles.chartValue}
                style={{ color: day.isToday ? "#1D4FD8" : "#33405A" }}
              >
                {day.isFuture ? "\u00A0" : hours > 0 ? formatHours(hours) : "0h"}
              </span>

              <div className={styles.chartTrackWrap}>
                <div
                  className={styles.chartTrack}
                  style={{ background: "#EDF2FB", border: "0" }}
                >
                  {!day.isFuture && (
                    <div
                      className={`${styles.barV} ${styles.chartBar}`}
                      style={
                        {
                          height: `${height}%`,
                          background: fill,
                          "--bar-delay": `${0.12 + index * 0.05}s`,
                        } as CSSProperties
                      }
                    />
                  )}
                </div>

                {targetPct !== null && day.isWorkday && (
                  <span
                    className={styles.targetLine}
                    style={{ bottom: `${targetPct}%` }}
                    title={`${formatHours(team.dailyTarget)} combined daily target`}
                    aria-hidden="true"
                  />
                )}
              </div>

              <span
                className={`${styles.dayPill} ${
                  day.isToday ? styles.dayPillToday : ""
                }`}
              >
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.chartSummary}>
        <span>
          {expectedLabel}{" "}
          <b>{hasTargets ? formatHours(team.expectedHours) : "—"}</b>
        </span>
        <span>
          Actual <b>{formatHours(team.loggedHours)}</b>
        </span>
        <span
          className={
            hasTargets
              ? gapPositive
                ? styles.summaryPositive
                : styles.summaryNegative
              : undefined
          }
        >
          Gap <b>{hasTargets ? formatSignedGap(team.gapHours) : "—"}</b>
        </span>
      </div>
    </section>
  );
}
