"use client";

import { useEffect, useState } from "react";
import LiveClockChip from "./LiveClockChip";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import { SlidersHorizontal } from "lucide-react";
import type { Theme } from "@/components/theme/ThemeProvider";

export interface DashboardHeaderProps {
  adminName: string;
  title: string;
  description: string;
  adminId?: string;
  adminEmail?: string | null;
  adminAvatarUrl?: string | null;
  initialTheme?: Theme;
  adminPosition?: string | null;
}

export default function DashboardHeader({
  adminName,
  title,
  description,
  adminId,
  adminEmail,
  adminAvatarUrl,
  initialTheme = "light",
  adminPosition,
}: DashboardHeaderProps) {
  const [greeting, setGreeting] = useState("Good evening");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    function resolveGreeting() {
      const hour = new Date().getHours();
      if (hour < 12) return "Good morning";
      if (hour < 18) return "Good afternoon";
      return "Good evening";
    }
    setGreeting(resolveGreeting());
    const id = setInterval(() => {
      setGreeting(resolveGreeting());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const firstName = adminName.trim().split(/\s+/)[0] || "Head";

  return (
    <>
      <header className="relative z-30 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between enter-up pl-12 sm:pl-14 lg:pl-0">
        {/* Left column: Greeting, Title, Subtitle */}
        <div>
          <p className="text-sm font-semibold text-blue-600 transition-colors">
            {greeting}, {firstName}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500 font-normal">
            {description}
          </p>
        </div>

        {/* Right column: Clock Chip, Notification Bell, Settings/Sliders */}
        <div className="relative z-40 flex items-center gap-2.5 self-start pt-1">
          <LiveClockChip />

          {adminId && (
            <NotificationBell
              userId={adminId}
              userName={adminName}
              role="head"
              variant="flat"
            />
          )}

          {adminId && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Settings & Preferences"
              aria-label="Settings & Preferences"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all hover:border-blue-200 hover:text-blue-600 hover:shadow-md active:scale-95"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      {adminId && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          userId={adminId}
          userName={adminName}
          userEmail={adminEmail ?? null}
          userAvatarUrl={adminAvatarUrl ?? null}
          initialTheme={initialTheme}
          position={adminPosition}
        />
      )}
    </>
  );
}
