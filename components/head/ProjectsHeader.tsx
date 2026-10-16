"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import type { Theme } from "@/components/theme/ThemeProvider";

export interface ProjectsHeaderProps {
  pendingCount: number;
  adminId: string;
  adminName: string;
  adminEmail: string | null;
  adminAvatarUrl: string | null;
  initialTheme?: Theme;
  adminPosition?: string | null;
}

export default function ProjectsHeader({
  pendingCount,
  adminId,
  adminName,
  adminEmail,
  adminAvatarUrl,
  initialTheme = "light",
  adminPosition,
}: ProjectsHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="relative z-30 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between animate-fade-in pl-12 sm:pl-14 lg:pl-0">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Project submissions
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500">
            Approve or reject staff project uploads. Selecting a project opens its approval page.
          </p>

          <div className="mt-3.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50/90 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200/60 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {pendingCount} awaiting review
            </span>
          </div>
        </div>

        {/* Upper Right: Notification Bell + Settings */}
        <div className="relative z-40 flex items-center gap-2.5 self-start pt-1">
          <NotificationBell
            userId={adminId}
            userName={adminName}
            role="head"
            variant="flat"
          />

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings & Preferences"
            aria-label="Settings & Preferences"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all hover:border-blue-200 hover:text-blue-600 hover:shadow-md active:scale-95"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={adminId}
        userName={adminName}
        userEmail={adminEmail}
        userAvatarUrl={adminAvatarUrl}
        initialTheme={initialTheme}
        position={adminPosition}
      />
    </>
  );
}
