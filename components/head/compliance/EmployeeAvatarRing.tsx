"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "@/app/head/compliance/compliance.module.css";

const RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface EmployeeAvatarRingProps {
  name: string;
  initials: string;
  avatarUrl?: string | null;
  /** Credited ÷ required, already uncapped. */
  percent: number;
  color: string;
  size?: 54 | 64;
  /** Entrance animation is only wanted on the first page render. */
  animate?: boolean;
}

/**
 * The circular avatar with a thin progress ring. The ring always shows the
 * employee's true credited percentage — a zero value leaves the pale track
 * visible instead of a cosmetic minimum arc.
 */
export default function EmployeeAvatarRing({
  name,
  initials,
  avatarUrl,
  percent,
  color,
  size = 54,
  animate = true,
}: EmployeeAvatarRingProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const clipped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const dash = (clipped / 100) * CIRCUMFERENCE;
  const inset = size === 64 ? 8 : 7;
  const inner = size - inset * 2;
  const showImage = Boolean(avatarUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <span
      className={styles.avatarWrap}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 54 54"
        className={styles.avatarSvg}
      >
        <circle
          cx="27"
          cy="27"
          r={RADIUS}
          fill="none"
          stroke="#E6EEFB"
          strokeWidth="3.5"
        />
        <circle
          className={`${styles.ringArc} ${animate ? "" : styles.noAnim}`}
          cx="27"
          cy="27"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap={clipped > 0 ? "round" : "butt"}
          strokeDasharray={`${dash.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
        />
      </svg>

      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl ?? undefined}
          alt=""
          className={styles.avatarImage}
          onError={() => setImageFailed(true)}
          style={
            {
              top: inset,
              left: inset,
              width: inner,
              height: inner,
            } as CSSProperties
          }
        />
      ) : (
        <span
          className={styles.avatarInitials}
          style={{
            top: inset,
            left: inset,
            width: inner,
            height: inner,
            fontSize: size === 64 ? 19 : 16,
          }}
          title={name}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
