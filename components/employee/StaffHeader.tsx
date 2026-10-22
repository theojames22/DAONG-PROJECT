"use client";

import { useEffect, useState } from "react";
import { Calendar, SlidersHorizontal } from "lucide-react";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import type { Theme } from "@/components/theme/ThemeProvider";

export interface StaffHeaderProps {
  title?: string;
  description?: string;
  /**
   * Optional small label above the title. When provided it replaces the
   * time-aware greeting, which is what secondary pages want instead of a
   * "Good morning" line. Omitted everywhere else, so those pages are
   * unchanged.
   */
  eyebrow?: string;
  fullName?: string;
  employeeId?: string;
  employeeEmail?: string | null;
  employeeAvatarUrl?: string | null;
  initialTheme?: Theme;
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  actionButton?: React.ReactNode;
  /** Staff clock in/out, so they keep the QR tab. */
  employeePosition?: string | null;
}

export default function StaffHeader({
  title = "My dashboard",
  description = "Track your recorded attendance, credited hours, and submit your work.",
  eyebrow,
  fullName = "Staff",
  employeeId,
  employeeEmail,
  employeeAvatarUrl,
  initialTheme = "light",
  selectedDate,
  onSelectDate,
  actionButton,
  employeePosition,
}: StaffHeaderProps) {
  const [greeting, setGreeting] = useState("Good morning");
  const [timeString, setTimeString] = useState("");
  const [dateString, setDateString] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const hour = now.getHours();
      if (hour < 12) setGreeting("Good morning");
      else if (hour < 18) setGreeting("Good afternoon");
      else setGreeting("Good evening");

      const time = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const date = now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      setTimeString(time);
      setDateString(date);
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const firstName = fullName.trim().split(/\s+/)[0] || "Staff";

  return (
    <>
      <header className="relative z-30 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between enter-up pl-12 sm:pl-14 lg:pl-0">
        {/* Left: eyebrow or time-aware greeting, 40px Page title, subtitle */}
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-staff-blue-ink">
              {eyebrow}
            </p>
          ) : (
            <p className="text-sm font-semibold text-staff-blue-ink transition-colors">
              {greeting}, {firstName}
            </p>
          )}
          <h1 className="mt-1 text-3xl sm:text-[40px] font-extrabold tracking-tight text-staff-ink leading-tight">
            {title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-normal text-staff-body max-w-xl">
            {description}
          </p>
        </div>

        {/* Right action cluster: action button, date picker, live clock, notification bell, settings */}
        <div className="relative z-40 flex flex-wrap items-center gap-2.5 self-start pt-1">
          {actionButton}

          {/* Compact Active Date selector if provided */}
          {selectedDate && onSelectDate && (
            <div className="flex items-center gap-2 rounded-full border border-staff-border bg-white px-3.5 py-2 shadow-xs transition-colors hover:border-blue-200">
              <Calendar className="h-3.5 w-3.5 text-staff-blue-ink shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-staff-body">
                  Date
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => onSelectDate(e.target.value)}
                  className="bg-transparent font-mono text-xs font-semibold text-staff-ink outline-none cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Live station clock pill */}
          <div className="flex items-center gap-2 rounded-full border border-staff-border bg-white px-3.5 py-2 shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-xs font-bold text-staff-ink tracking-tight">
              {timeString || "00:00:00"}
            </span>
            <span className="text-[11px] font-medium text-staff-body">
              {dateString ? `| ${dateString}` : ""}
            </span>
          </div>

          {/* Round Notification Bell */}
          {employeeId && (
            <NotificationBell
              userId={employeeId}
              userName={fullName}
              role="staff"
              variant="flat"
            />
          )}

          {/* Round Settings Button */}
          {employeeId && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Settings & Preferences"
              aria-label="Settings & Preferences"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-staff-border bg-white text-staff-muted shadow-xs transition-all hover:border-blue-200 hover:text-staff-blue-ink hover:shadow-md active:scale-95"
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      {employeeId && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          userId={employeeId}
          userName={fullName}
          userEmail={employeeEmail ?? null}
          userAvatarUrl={employeeAvatarUrl ?? null}
          initialTheme={initialTheme}
          position={employeePosition}
        />
      )}
    </>
  );
}
