"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";

export interface EmployeeTopBarProps {
  employeeId: string;
  employeeName: string;
  employeeEmail: string | null;
  employeeAvatarUrl: string | null;
  initialTheme: "light" | "dark";
  employeePosition?: string | null;
}

export default function EmployeeTopBar({
  employeeId,
  employeeName,
  employeeEmail,
  employeeAvatarUrl,
  initialTheme,
  employeePosition,
}: EmployeeTopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();

  // On the employee dashboard and schedule pages, StaffHeader embeds
  // the cluster directly (also covers the head's schedule page, which
  // reuses MyScheduleView)
  if (
    pathname === "/employee" ||
    pathname === "/employee/schedule" ||
    pathname === "/head/schedule"
  ) {
    return null;
  }

  return (
    <>
      {/* Fixed top-right action cluster — mirrors the Head dashboard */}
      <div className="fixed right-4 top-4 z-[60] flex items-center gap-2.5">
        <NotificationBell userId={employeeId} userName={employeeName} role="staff" />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
          className="neu-icon-btn neu-focus flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 transition-colors hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <SettingsGearIcon />
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={employeeId}
        userName={employeeName}
        userEmail={employeeEmail}
        userAvatarUrl={employeeAvatarUrl}
        initialTheme={initialTheme}
        position={employeePosition}
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
