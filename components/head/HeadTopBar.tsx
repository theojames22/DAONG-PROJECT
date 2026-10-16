"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import LiveClockChip from "@/components/head/dashboard/LiveClockChip";

export interface HeadTopBarProps {
  headId: string;
  headName: string;
  headEmail: string | null;
  headAvatarUrl: string | null;
  initialTheme: "light" | "dark";
  /** Heads are administrators and have no QR code of their own. */
  headPosition?: string | null;
}

export default function HeadTopBar({
  headId,
  headName,
  headEmail,
  headAvatarUrl,
  initialTheme,
  headPosition,
}: HeadTopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();

  // On overview, attendance, team, projects, equipment log, schedule
  // and reports, the page header itself embeds the cluster
  if (
    pathname === "/head" ||
    pathname === "/head/workforce" ||
    pathname === "/head/projects" ||
    pathname === "/head/equipment" ||
    pathname === "/head/schedule" ||
    pathname === "/head/reports"
  ) {
    return null;
  }

  return (
    <>
      {/* Fixed top-right action cluster — mirrors the floating hamburger
          trigger's fixed positioning on the opposite corner.
          Order: live clock, notifications, settings. */}
      <div className="fixed right-4 top-4 z-[60] flex items-center gap-2.5">
        <LiveClockChip />
        <NotificationBell userId={headId} userName={headName} role="head" />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-accent/30 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <SettingsGearIcon />
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={headId}
        userName={headName}
        userEmail={headEmail}
        userAvatarUrl={headAvatarUrl}
        initialTheme={initialTheme}
        position={headPosition}
      />
    </>
  );
}

/** Inline gear so we don't pull the whole icon set into this bundle. */
function SettingsGearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
