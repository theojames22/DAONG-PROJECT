"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import { Profile, Session, Output } from "@/lib/types";
import { toDateKey } from "@/lib/attendance";
import EmployeeTopBar from "./EmployeeTopBar";
import StaffSidebar from "./StaffSidebar";
import StaffHeader from "./StaffHeader";
import WeeklyQuotaCard from "./WeeklyQuotaCard";
import WeekTelemetryCard, { DayTelemetryItem, DaySessionItem } from "./WeekTelemetryCard";
import SubmitDeliverableCard from "./SubmitDeliverableCard";
import AuditTrailPanel from "./AuditTrailPanel";

interface TelemetryMetrics {
  hoursToday: number;
  hoursThisWeek: number;
  requiredWeeklyHours: number;
  percentMet: number;
  remainingHours: number;
  coreShift: number;
  standbyHours: number;
  overtimeHours: number;
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
}: StaffDashboardProps) {
  // 1. Global selectedDate state
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toDateKey(new Date().toISOString())
  );

  const [telemetryData, setTelemetryData] = useState<TelemetryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 2. Fetch from the Backend API: /api/telemetry?date=${selectedDate}
  const fetchTelemetry = useCallback(async (date: string) => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  // 1. useEffect Hook: Triggers every time the global selectedDate state changes
  useEffect(() => {
    fetchTelemetry(selectedDate);
  }, [selectedDate, fetchTelemetry]);

  // Refetch helper for child action triggers (e.g. submit deliverable, clock in/out)
  const handleRefetch = () => {
    fetchTelemetry(selectedDate);
  };

  // 3. Dynamically populate data from the fetched state (no hardcoded static values)
  const metrics = telemetryData?.metrics ?? {
    hoursToday: 0,
    hoursThisWeek: 0,
    requiredWeeklyHours: profile.required_weekly_hours || 40,
    percentMet: 0,
    remainingHours: profile.required_weekly_hours || 40,
    coreShift: 0,
    standbyHours: 0,
    overtimeHours: 0,
  };

  const daySessions = telemetryData?.daySessions ?? [];
  const weekTelemetry = telemetryData?.weekTelemetry ?? [];
  const outputs = telemetryData?.outputs ?? [];

  return (
    <div className="min-h-screen bg-base font-sans antialiased text-ink">
      {/* Top-right notification + settings cluster — same as admin */}
      <EmployeeTopBar
        employeeId={profile.id}
        employeeName={profile.full_name || "Alex Mercer"}
        employeeEmail={profile.email ?? null}
        employeeAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={profile.theme_preference ?? "light"}
      />

      {/* Floating hamburger sidebar — same pattern as the admin dashboard */}
      <StaffSidebar
        fullName={profile.full_name || "Alex Mercer"}
        position={profile.position}
        employeeId={profile.id}
        avatarUrl={profile.profile_picture_url}
      />

      <main className="mx-auto max-w-[1720px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-20 lg:pb-8 flex flex-col gap-5">
        {/* Staff Header with Date Picker & Live Station Clock */}
        <StaffHeader
          selectedDate={selectedDate}
          onSelectDate={(newDate) => setSelectedDate(newDate)}
        />

        {/* Workstation Grid — Quota Stack, Submit Deliverable, Audit Trail */}
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-12 gap-5 items-start">
          {/* Column 1: Weekly Targets & Attendance */}
          <div className="2xl:col-span-4 flex flex-col gap-4 w-full">
            {/* Dynamic Weekly Target Quota Card */}
            <WeeklyQuotaCard
              hoursThisWeek={metrics.hoursThisWeek}
              requiredWeeklyHours={metrics.requiredWeeklyHours}
              standbyHours={metrics.standbyHours}
              overtimeHours={metrics.overtimeHours}
              percentMet={metrics.percentMet}
              remainingHours={metrics.remainingHours}
            />

            {/* Dynamic Week Telemetry & Attendance Table */}
            <WeekTelemetryCard
              weekTelemetry={weekTelemetry}
              daySessions={daySessions}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d)}
            />
          </div>

          {/* Column 2: Submit Deliverables & Work Outputs */}
          <div className="2xl:col-span-5 flex flex-col w-full h-full">
            <SubmitDeliverableCard
              employeeId={profile.id}
              onSubmitted={handleRefetch}
            />
          </div>

          {/* Column 3: Security note + Audit Trail Panel */}
          <div className="md:col-span-2 2xl:col-span-3 flex flex-col gap-4 w-full h-full">
            <div className="neu-raised rounded-neu p-4">
              <div className="flex items-center gap-1.5 text-ink-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-muted">
                  System Security
                </span>
              </div>
              <p className="mt-1 text-[13px] font-bold text-ink">Admin Locked Telemetry</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                Manual override is restricted to authorized operations directors.
              </p>
            </div>

            <AuditTrailPanel outputs={outputs} />
          </div>
        </div>
      </main>
    </div>
  );
}
