"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { formatHours } from "@/lib/attendance";
import { formatCountdown } from "@/lib/compliance/helpers";
import type { ComplianceTeam } from "@/lib/compliance/types";
import styles from "@/app/head/compliance/compliance.module.css";

const RING_RADIUS = 68;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface TeamComplianceCardProps {
  team: ComplianceTeam;
  isCurrentWeek: boolean;
  weekEndsAt: string | null;
  generatedAt: string;
}

/**
 * The gradient team summary: credited progress (ring), raw hours logged,
 * the required total and the two headline chips. The ring never shows a
 * fake minimum — a zero-credit week simply has a pale track.
 */
export default function TeamComplianceCard({
  team,
  isCurrentWeek,
  weekEndsAt,
  generatedAt,
}: TeamComplianceCardProps) {
  const countdown = useWeekCountdown(
    isCurrentWeek,
    weekEndsAt,
    generatedAt
  );
  const ringCap = Math.max(0, Math.min(100, team.percent));
  const dash = (ringCap / 100) * RING_CIRCUMFERENCE;
  const displayPercent =
    team.requiredHours <= 0
      ? "0"
      : team.percent < 10
        ? team.percent.toFixed(1)
        : String(Math.round(team.percent));
  const requiredSub =
    team.staffCount <= 0
      ? "No staff yet"
      : team.trackedCount <= 0
        ? "No weekly targets set"
        : team.uniformRequired !== null
          ? `${team.trackedCount} × ${formatHours(team.uniformRequired)}`
          : `${team.trackedCount} tracked, varied targets`;

  const firstChip =
    team.requiredHours <= 0
      ? "No weekly targets set"
      : isCurrentWeek
        ? `${team.belowCount} of ${team.trackedCount} below required hours`
        : `${team.belowCount} of ${team.trackedCount} finished short`;

  // Chips stay on the same metric as the ring (credited hours), so a week
  // with logged time but no submitted output reads consistently.
  const secondChip =
    team.requiredHours <= 0
      ? "Team progress is not tracked"
      : isCurrentWeek
        ? team.remainingHours > 0
          ? `${team.remainingHours.toFixed(1)}h still to credit`
          : "All targets met"
        : team.remainingHours > 0
          ? `${team.remainingHours.toFixed(1)}h short of target`
          : "All targets met";

  const ringLabel =
    team.requiredHours <= 0
      ? "No team target set."
      : `${formatHours(team.creditedHours)} credited of ${formatHours(
          team.requiredHours
        )} required, ${displayPercent}% of target.`;

  return (
    <section
      className={`${styles.teamCard} ${styles.rise}`}
      style={{ "--rise-delay": "0.05s" } as CSSProperties}
      aria-labelledby="team-compliance-heading"
    >
      <div className={styles.teamTop}>
        <h2 id="team-compliance-heading" className={styles.teamKicker}>
          Team compliance
        </h2>
        <span className={styles.teamChip}>{countdown}</span>
      </div>

      <div className={styles.teamBody}>
        <div className={styles.ringWrap} role="img" aria-label={ringLabel}>
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            aria-hidden="true"
            className={styles.ringSvg}
          >
            <circle
              cx="80"
              cy="80"
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,.22)"
              strokeWidth="12"
            />
            <circle
              className={styles.ringArc}
              cx="80"
              cy="80"
              r={RING_RADIUS}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="12"
              strokeLinecap={ringCap > 0 ? "round" : "butt"}
              strokeDasharray={`${dash.toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(
                2
              )}`}
            />
          </svg>

          <div className={styles.ringCenter}>
            <span className={styles.ringValue}>
              {displayPercent}
              <span className={styles.ringPct}>%</span>
            </span>
            <span className={styles.ringSub}>of required credited hours</span>
          </div>
        </div>

        <dl className={styles.heroStats}>
          <div className={styles.heroStat}>
            <dt className={styles.heroStatLabel}>Hours credited</dt>
            <dd className={styles.heroLogged}>
              {formatHours(team.creditedHours)}
            </dd>
          </div>
          <div className={styles.heroStat}>
            <dt className={styles.heroStatLabel}>Hours logged</dt>
            <dd className={styles.heroLogged}>
              {formatHours(team.loggedHours)}
            </dd>
          </div>
          <div className={styles.heroStat}>
            <dt className={styles.heroStatLabel}>Hours required</dt>
            <dd className={styles.heroRequired}>
              {team.requiredHours > 0
                ? formatHours(team.requiredHours)
                : "—"}{" "}
              <span className={styles.heroRequiredSub}>{requiredSub}</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.heroChips}>
        <span className={styles.heroChip}>{firstChip}</span>
        <span className={styles.heroChip}>{secondChip}</span>
      </div>
    </section>
  );
}

function useWeekCountdown(
  isCurrentWeek: boolean,
  weekEndsAt: string | null,
  generatedAt: string
): string {
  const [label, setLabel] = useState(() =>
    initialCountdownLabel(isCurrentWeek, weekEndsAt, generatedAt)
  );

  useEffect(() => {
    if (!isCurrentWeek || !weekEndsAt) {
      setLabel(initialCountdownLabel(isCurrentWeek, weekEndsAt, generatedAt));
      return;
    }

    const end = Date.parse(weekEndsAt);
    const generated = Date.parse(generatedAt);
    const anchoredAt = Date.now();
    const remainingAtAnchor = end - generated;

    const tick = () => {
      setLabel(formatCountdown(remainingAtAnchor - (Date.now() - anchoredAt)));
    };

    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [generatedAt, isCurrentWeek, weekEndsAt]);

  return label;
}

function initialCountdownLabel(
  isCurrentWeek: boolean,
  weekEndsAt: string | null,
  generatedAt: string
): string {
  if (!isCurrentWeek) return "Week closed";
  if (!weekEndsAt) return "Week closes Sunday";
  const remaining = Date.parse(weekEndsAt) - Date.parse(generatedAt);
  return formatCountdown(remaining);
}
