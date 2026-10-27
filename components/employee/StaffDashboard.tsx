"use client";

import { useState, useEffect, useCallback } from "react";
import { Profile, Session, Output } from "@/lib/types";
import { toDateKey } from "@/lib/attendance";
import EmployeeTopBar from "./EmployeeTopBar";
import StaffSidebar from "./StaffSidebar";
import StaffHeader from "./StaffHeader";
import StaffTopMetricsCards from "./StaffTopMetricsCards";
import SubmitDeliverableCard from "./SubmitDeliverableCard";
import WeekTelemetryCard, { DayTelemetryItem, DaySessionItem } from "./WeekTelemetryCard";
import AuditTrailPanel from "./AuditTrailPanel";

interface TelemetryMetrics {
  // Attendance hours — raw recorded history.
  hoursToday: number;
  hoursThisWeek: number;
  requiredWeeklyHours: number;
  hoursLoggedPercent: number;
  coreShift: number;
  standbyHours: number;
  overtimeHours: number;
  // Credited hours — what counts toward the weekly requirement.
  creditedHours: number;
  creditedPercentMet: number;
  creditedRemainingHours: number;
  creditedDays: number;
  attendanceDays: number;
}

interface TelemetryApiResponse {
  selectedDate: string;
  isClockedIn: boolean;
  openSession: Session | null;
  metrics: TelemetryMetrics;
  daySessions: DaySessionItem[];
  weekTelemetry: DayTelemetryItem[];
  outputs: Output[];
}

interface StaffDashboardProps {
  profile: Profile;
  initialWeekSessions?: Session[];
  initialTodaySessions?: Session[];
  initialOutputs?: Output[];
}

export default function StaffDashboard({
  profile,
  initialTodaySessions = [],
}: StaffDashboardProps) {
  // 1. Global selectedDate state
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toDateKey(new Date().toISOString())
  );

  const [telemetryData, setTelemetryData] = useState<TelemetryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 2. Fetch from the Backend API: /api/telemetry?date=${selectedDate}
  const fetchTelemetry = useCallback(async (date: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/telemetry?date=${date}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch telemetry for date: ${date}`);
      }
      const data: TelemetryApiResponse = await response.json();
      setTelemetryData(data);
    } catch (error) {
      console.error("Telemetry fetch error:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // useEffect Hook: Triggers every time the global selectedDate state changes
  useEffect(() => {
    fetchTelemetry(selectedDate);
  }, [selectedDate, fetchTelemetry]);

  // Refetch helper for child action triggers (e.g. submit deliverable)
  const handleRefetch = () => {
    fetchTelemetry(selectedDate);
  };

  // Dynamically populate data from the fetched state (no hardcoded static values)
  const metrics = telemetryData?.metrics ?? {
    hoursToday: 0,
    hoursThisWeek: 0,
    requiredWeeklyHours: profile.required_weekly_hours || 40,
    hoursLoggedPercent: 0,
    coreShift: 0,
    standbyHours: 0,
    overtimeHours: 0,
    creditedHours: 0,
    creditedPercentMet: 0,
    creditedRemainingHours: profile.required_weekly_hours || 40,
    creditedDays: 0,
    attendanceDays: 0,
  };

  const daySessions = telemetryData?.daySessions ?? [];
  const weekTelemetry = telemetryData?.weekTelemetry ?? [];
  const outputs = telemetryData?.outputs ?? [];

  // Rule: an output may only be submitted once the employee has clocked in
  // today. The server props carry today's sessions on load; the telemetry
  // response refreshes them whenever the selected date is today.
  const todayKey = toDateKey(new Date().toISOString());
  const clockedInToday =
    Boolean(telemetryData?.isClockedIn) ||
    initialTodaySessions.length > 0 ||
    (telemetryData?.selectedDate === todayKey && daySessions.length > 0);

  // Quietly poll every 15s while viewing today if not clocked in yet
  useEffect(() => {
    if (clockedInToday || selectedDate !== todayKey) return;
    const interval = setInterval(() => {
      fetchTelemetry(selectedDate, true);
    }, 15_000);
    return () => clearInterval(interval);
  }, [clockedInToday, selectedDate, todayKey, fetchTelemetry]);

  return (
    <div className="min-h-screen font-sans antialiased text-staff-ink">
      {/* Top bar controls */}
      <EmployeeTopBar
        employeeId={profile.id}
        employeeName={profile.full_name || "Staff"}
        employeeEmail={profile.email ?? null}
        employeeAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={profile.theme_preference ?? "light"}
        employeePosition={profile.position}
      />

      {/* Floating hamburger sidebar */}
      <StaffSidebar
        fullName={profile.full_name || "Staff"}
        position={profile.position}
        employeeId={profile.id}
        avatarUrl={profile.profile_picture_url}
      />

      <main className="mx-auto max-w-[1720px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12 flex flex-col gap-6">
        {/* Staff Header with time-aware greeting, 40px Page Title, Live Clock & Active Date */}
        <StaffHeader
          title="My dashboard"
          description="Track your recorded attendance, credited hours, and submit your work."
          fullName={profile.full_name || "Staff"}
          employeeId={profile.id}
          employeeEmail={profile.email ?? null}
          employeeAvatarUrl={profile.profile_picture_url ?? null}
          initialTheme={profile.theme_preference ?? "light"}
          selectedDate={selectedDate}
          onSelectDate={(newDate) => setSelectedDate(newDate)}
          employeePosition={profile.position}
        />

        {/* 2-Column Dashboard Grid: Wide Left Column + Narrower Right Column */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Wide: cols 1-7 on desktop, 1-8 on xl screens) */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 w-full">
            {/* Top row (three cards): Today, Hours this week, Credited hours */}
            <StaffTopMetricsCards
              isClockedIn={clockedInToday}
              hoursToday={metrics.hoursToday}
              hoursThisWeek={metrics.hoursThisWeek}
              requiredWeeklyHours={metrics.requiredWeeklyHours}
              creditedHours={metrics.creditedHours}
              standbyHours={metrics.standbyHours}
              overtimeHours={metrics.overtimeHours}
            />

            {/* Submit your work Card */}
            <SubmitDeliverableCard
              clockedIn={clockedInToday}
              onSubmitted={handleRefetch}
            />
          </div>

          {/* Right Column (Narrower: cols 8-12 on desktop, 9-12 on xl screens) */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6 w-full">
            {/* This week Card: Week/Day toggle, weekly cycle label, Monday-Sunday list */}
            <WeekTelemetryCard
              weekTelemetry={weekTelemetry}
              daySessions={daySessions}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d)}
            />

            {/* My submissions Card: Read-only chip, Total/Approved/In review counts, locked items */}
            <AuditTrailPanel outputs={outputs} />
          </div>
        </div>
      </main>
    </div>
  );
}
