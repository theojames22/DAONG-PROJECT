import type { CSSProperties } from "react";
import type { OutputStatus } from "@/lib/types";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import { STATUS_META, isDecided } from "./my-outputs-ui";

/**
 * The real three-stage review pipeline.
 *
 * Nothing here is time-based or guessed: the nodes reflect the stored status.
 * "Checking" is only reached once the submission has left pending, and the
 * final node is green/red only when a decision actually exists.
 */
export default function ReviewTimeline({
  status,
  className = "",
}: {
  status: OutputStatus;
  className?: string;
}) {
  const reachedChecking = status !== "pending";
  const decided = isDecided(status);
  const checkingActive = status === "checking";

  const decisionColor =
    status === "done"
      ? "var(--mo-success)"
      : status === "rejected"
        ? "var(--mo-danger)"
        : "var(--mo-border)";
  const decisionLabel =
    status === "done" ? "Approved" : status === "rejected" ? "Rejected" : "Decision";
  const decisionText =
    status === "done"
      ? "var(--mo-success-ink)"
      : status === "rejected"
        ? "var(--mo-danger-ink)"
        : "var(--mo-muted)";

  const line1 = reachedChecking ? "var(--mo-blue)" : "var(--mo-border)";
  const line2 = decided
    ? `linear-gradient(90deg, var(--mo-blue), ${decisionColor})`
    : "var(--mo-border)";

  const aria =
    status === "pending"
      ? "Review progress: submitted, waiting for review"
      : status === "checking"
        ? "Review progress: submitted, now being checked"
        : `Review progress: submitted, checked, ${STATUS_META[status].label.toLowerCase()}`;

  const nodeBase: CSSProperties = {
    width: 14,
    height: 14,
    background: "var(--mo-card)",
    border: "2px solid var(--mo-border)",
  };

  return (
    <div
      role="img"
      aria-label={aria}
      className={`${styles.timeline} ${className}`}
    >
      <div className={styles.timelineStage}>
        <span
          className={styles.node}
          style={{ background: "var(--mo-blue)" }}
          aria-hidden="true"
        />
        <span className={styles.timelineLabel}>Submitted</span>
      </div>

      <span
        className={styles.timelineLine}
        style={{ background: line1 }}
        aria-hidden="true"
      />

      <div className={`${styles.timelineStage} ${styles.timelineStageCenter}`}>
        <span
          className={`${styles.node} ${checkingActive ? styles.nodePulse : ""}`}
          style={
            reachedChecking
              ? {
                  width: 14,
                  height: 14,
                  background: "var(--mo-blue)",
                  border: "2px solid var(--mo-blue)",
                }
              : nodeBase
          }
          aria-hidden="true"
        />
        <span
          className={styles.timelineLabel}
          style={{ color: reachedChecking ? "var(--mo-blue-ink)" : "var(--mo-muted)" }}
        >
          Checking
        </span>
      </div>

      <span
        className={styles.timelineLine}
        style={{ background: line2 }}
        aria-hidden="true"
      />

      <div className={`${styles.timelineStage} ${styles.timelineStageEnd}`}>
        <span
          className={styles.node}
          style={
            decided
              ? {
                  width: 14,
                  height: 14,
                  background: decisionColor,
                  border: `2px solid ${decisionColor}`,
                }
              : nodeBase
          }
          aria-hidden="true"
        />
        <span className={styles.timelineLabel} style={{ color: decisionText }}>
          {decisionLabel}
        </span>
      </div>
    </div>
  );
}
