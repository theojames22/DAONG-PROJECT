"use client";

import { useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import type { WeeklyCompliancePayload } from "@/lib/compliance/types";
import styles from "@/app/head/compliance/compliance.module.css";

export interface ComplianceHead {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  position?: string | null;
  theme: "light" | "dark";
}

export interface ComplianceHeaderProps {
  data: WeeklyCompliancePayload;
  head: ComplianceHead;
  loadingWeek: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onThisWeek: () => void;
}

/**
 * Page header with the week navigator and the shared notification/settings
 * controls. HeadTopBar is suppressed for this route so those controls live
 * here, exactly like Workforce, instead of floating over the week pill.
 */
export default function ComplianceHeader({
  data,
  head,
  loadingWeek,
  onPrevious,
  onNext,
  onThisWeek,
}: ComplianceHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canGoNext = data.weekStart < data.currentWeekStart;

  return (
    <header
      className={`${styles.header} ${styles.rise}`}
      style={{ "--rise-delay": "0s" } as CSSProperties}
    >
      <div className={styles.headerIdentity}>
        <span className={styles.eyebrow}>
          Compliance · Week {data.weekNumber}
        </span>
        <h1 className={styles.pageTitle}>Weekly Compliance</h1>
        <p className={styles.weekRange}>{data.weekLabel}</p>
      </div>

      <div className={styles.headerActions}>
        <div
          className={styles.weekNav}
          data-loading={loadingWeek ? "true" : undefined}
        >
          <button
            type="button"
            className={styles.navBtn}
            onClick={onPrevious}
            disabled={loadingWeek}
            aria-label="Previous week"
            title="Previous week"
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>

          <span
            className={styles.weekNavLabel}
            aria-live="polite"
            aria-busy={loadingWeek}
          >
            {data.navLabel}
          </span>

          <button
            type="button"
            className={styles.navBtn}
            onClick={onNext}
            disabled={loadingWeek || !canGoNext}
            aria-label="Next week"
            title={canGoNext ? "Next week" : "This is the current week"}
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        </div>

        {!data.isCurrentWeek && (
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={onThisWeek}
            disabled={loadingWeek}
          >
            This week
          </button>
        )}

        <span className={styles.iconScope}>
          <NotificationBell
            userId={head.id}
            userName={head.name}
            role="head"
            variant="flat"
          />
        </span>

        <button
          type="button"
          className={styles.roundBtn}
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          <SlidersHorizontal size={20} strokeWidth={2} />
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={head.id}
        userName={head.name}
        userEmail={head.email}
        userAvatarUrl={head.avatarUrl}
        initialTheme={head.theme}
        position={head.position}
      />
    </header>
  );
}
