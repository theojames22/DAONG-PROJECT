"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  CalendarDays,
  ListFilter,
  Sparkles,
} from "lucide-react";
import { Profile, Availability } from "@/lib/types";
import { toDateKey } from "@/lib/attendance";
import StaffHeader from "./StaffHeader";
import EmployeeTopBar from "./EmployeeTopBar";
import StaffSidebar from "./StaffSidebar";

interface MyScheduleViewProps {
  profile: Profile;
}

// Helper: Calculate duration between two time strings (HH:mm or HH:mm:ss) in hours
function getDurationHours(start: string, end: string): number {
  try {
    const [sH, sM] = start.split(":").map(Number);
    const [eH, eM] = end.split(":").map(Number);
    const sMinutes = sH * 60 + sM;
    const eMinutes = eH * 60 + eM;
    return Math.max(0, (eMinutes - sMinutes) / 60);
  } catch {
    return 0;
  }
}

// Helper: Format 24h time string (e.g. "09:00:00" or "14:30") to 12h format (e.g. "9:00 AM")
function formatTime12h(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minStr = m < 10 ? `0${m}` : `${m}`;
    return `${hour12}:${minStr} ${period}`;
  } catch {
    return timeStr;
  }
}

export default function MyScheduleView({ profile }: MyScheduleViewProps) {
  const todayKey = useMemo(() => toDateKey(new Date().toISOString()), []);

  // Selected date in the calendar
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  // Month navigation state: current year and month (0-indexed)
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth());

  // View mode: Month vs Week
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  // Availabilities list from database
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Notifications (toast message)
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<Availability | null>(null);
  const [modalDate, setModalDate] = useState<string>(todayKey);
  const [modalStartTime, setModalStartTime] = useState<string>("09:00");
  const [modalEndTime, setModalEndTime] = useState<string>("17:00");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [modalStatus, setModalStatus] = useState<"available" | "unavailable">(
    "available"
  );
  // Repeat weekly (recurring availability)
  const [repeatWeekly, setRepeatWeekly] = useState<boolean>(false);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(() => [
    new Date().getDay(),
  ]);
  const [repeatUntil, setRepeatUntil] = useState<string>("");
  // Field-level validation errors (highlighted inputs)
  const [fieldErrors, setFieldErrors] = useState<{
    date?: string;
    start?: string;
    end?: string;
  }>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Two-step delete confirmation state (stores ID of item awaiting second confirmation)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Clear toast timer
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch availabilities from backend API
  const fetchAvailabilities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/availability");
      if (!res.ok) throw new Error("Failed to load schedule");
      const data = await res.json();
      // The API responds { data: [...] } — keep this in sync with
      // app/api/employee/availability/route.ts
      setAvailabilities(data.data || []);
    } catch (err: any) {
      console.error(err);
      setToast({ type: "error", message: err.message || "Could not load schedule" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailabilities();
  }, [fetchAvailabilities]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayKey);
  };

  // Open modal for Adding
  const openAddModal = (dateToUse?: string) => {
    const useDate = dateToUse || selectedDate || todayKey;
    setEditingItem(null);
    setModalDate(useDate);
    setModalStartTime("09:00");
    setModalEndTime("17:00");
    setModalNotes("");
    setModalStatus("available");
    setRepeatWeekly(false);
    setRepeatWeekdays([new Date(`${useDate}T00:00:00`).getDay()]);
    setRepeatUntil("");
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  // Open modal for Editing
  const openEditModal = (item: Availability) => {
    setEditingItem(item);
    setModalDate(item.date);
    setModalStartTime(item.start_time.slice(0, 5));
    setModalEndTime(item.end_time.slice(0, 5));
    setModalNotes(item.notes || "");
    setModalStatus(item.status === "unavailable" ? "unavailable" : "available");
    setRepeatWeekly(false);
    setRepeatWeekdays([]);
    setRepeatUntil("");
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  // Client validation for conflict check
  const checkConflict = (
    date: string,
    startTime: string,
    endTime: string,
    ignoreId?: string
  ): Availability | null => {
    const [newStartH, newStartM] = startTime.split(":").map(Number);
    const [newEndH, newEndM] = endTime.split(":").map(Number);
    const newStartMinutes = newStartH * 60 + newStartM;
    const newEndMinutes = newEndH * 60 + newEndM;

    for (const item of availabilities) {
      if (item.date !== date) continue;
      if (ignoreId && item.id === ignoreId) continue;

      const [curStartH, curStartM] = item.start_time.split(":").map(Number);
      const [curEndH, curEndM] = item.end_time.split(":").map(Number);
      const curStartMinutes = curStartH * 60 + curStartM;
      const curEndMinutes = curEndH * 60 + curEndM;

      // Overlap condition: start < existing_end && end > existing_start
      if (newStartMinutes < curEndMinutes && newEndMinutes > curStartMinutes) {
        return item;
      }
    }
    return null;
  };

  const clearFieldError = (field: "date" | "start" | "end") =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  // Save (Add / Edit) Availability
  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // 1. Missing field check (per-field, highlighted)
    const nextErrors: { date?: string; start?: string; end?: string } = {};
    if (!modalDate) nextErrors.date = "Please select a date.";
    if (!modalStartTime) nextErrors.start = "Please select a start time.";
    if (!modalEndTime) nextErrors.end = "Please select an end time.";

    // 2. Past date check
    if (!nextErrors.date && modalDate < todayKey) {
      nextErrors.date = "Cannot set availability for past dates.";
    }

    // 3. End time > start time check
    if (
      !nextErrors.start &&
      !nextErrors.end &&
      modalEndTime <= modalStartTime
    ) {
      nextErrors.end = "The end time must be later than the start time.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});

    // 4. Overlap with the person's own entries (backend re-checks too).
    //    Frontend check uses the rows already loaded for this date.
    const conflict = checkConflict(
      modalDate,
      modalStartTime,
      modalEndTime,
      editingItem?.id
    );
    if (conflict) {
      const message =
        conflict.start_time.slice(0, 5) === modalStartTime &&
        conflict.end_time.slice(0, 5) === modalEndTime
          ? "This schedule already exists."
          : "You already have an availability schedule that overlaps with this time.";
      setFieldErrors({ start: message, end: message });
      return;
    }

    // 5. Recurrence sanity
    if (repeatWeekly && !editingItem) {
      if (repeatWeekdays.length === 0) {
        setModalError("Select at least one weekday to repeat on.");
        return;
      }
      if (!repeatUntil || repeatUntil < modalDate) {
        setModalError("Pick an end date on or after the start date.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        date: modalDate,
        start_time: modalStartTime,
        end_time: modalEndTime,
        notes: modalNotes.trim() || null,
        status: modalStatus,
        ...(repeatWeekly && !editingItem
          ? {
              recurrence: {
                weekdays: repeatWeekdays,
                until: repeatUntil,
              },
            }
          : {}),
      };

      let res: Response;
      if (editingItem) {
        res = await fetch("/api/employee/availability", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingItem.id, ...payload }),
        });
      } else {
        res = await fetch("/api/employee/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Server-side conflict/duplicate messages map onto the time fields
        // so the offending inputs are highlighted.
        const serverError: string = data.error || "Failed to save availability";
        setFieldErrors({ start: serverError, end: serverError });
        return;
      }

      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setToast({
        type: "success",
        message:
          skippedCount > 0
            ? `Availability saved for ${data.data?.length ?? 1} ${
                (data.data?.length ?? 1) === 1 ? "date" : "dates"
              } · ${skippedCount} skipped (already booked or overlapping)`
            : "Your availability has been saved successfully.",
      });
      setModalOpen(false);
      // Refresh list from database
      await fetchAvailabilities();
      setSelectedDate(modalDate);
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || "An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Availability (single entry, or a whole recurring series)
  const handleDelete = async (
    id: string,
    seriesId?: string | null
  ) => {
    try {
      const query = seriesId
        ? `?series_id=${seriesId}`
        : `?id=${id}`;
      const res = await fetch(`/api/employee/availability${query}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");

      setToast({
        type: "success",
        message: seriesId
          ? "Recurring availability removed"
          : "Availability entry removed",
      });
      setDeletingId(null);
      await fetchAvailabilities();
    } catch (err: any) {
      console.error(err);
      setToast({ type: "error", message: err.message || "Could not delete entry" });
    }
  };

  // Calendar Grid Generation (Monday-first grid)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

    // Monday-first: Mon=0, Tue=1, ... Sun=6
    const startDayIndex = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastDayOfMonth.getDate();

    const days: Array<{
      dateKey: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      items: Availability[];
    }> = [];

    // Previous month padding days
    const prevMonthLastDate = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDate - i;
      const prevDate = new Date(viewYear, viewMonth - 1, dayNum);
      const dateKey = toDateKey(prevDate.toISOString());
      days.push({
        dateKey,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
        items: availabilities.filter((a) => a.date === dateKey),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(viewYear, viewMonth, d);
      const dateKey = toDateKey(curDate.toISOString());
      days.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
        items: availabilities.filter((a) => a.date === dateKey),
      });
    }

    // Next month padding days to complete 35 or 42 grid cells
    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remainingCells; d++) {
      const nextDate = new Date(viewYear, viewMonth + 1, d);
      const dateKey = toDateKey(nextDate.toISOString());
      days.push({
        dateKey,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
        items: availabilities.filter((a) => a.date === dateKey),
      });
    }

    return days;
  }, [viewYear, viewMonth, availabilities, selectedDate, todayKey]);

  // Month title: e.g. "October 2026"
  const monthTitle = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [viewYear, viewMonth]);

  // Monthly stats: Days with saved availability, total hours
  const monthStats = useMemo(() => {
    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    const thisMonthItems = availabilities.filter((a) => a.date.startsWith(monthPrefix));
    const uniqueDays = new Set(thisMonthItems.map((a) => a.date)).size;
    const totalHours = thisMonthItems.reduce(
      (sum, a) => sum + getDurationHours(a.start_time, a.end_time),
      0
    );
    return {
      daysCount: uniqueDays,
      totalHours: Number(totalHours.toFixed(1)),
    };
  }, [availabilities, viewYear, viewMonth]);

  // Selected date periods
  const selectedDateItems = useMemo(() => {
    return availabilities
      .filter((a) => a.date === selectedDate)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [availabilities, selectedDate]);

  // Selected date formatted label (e.g. "Tuesday, Oct 13, 2026")
  const selectedDateLabel = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Week view calculation: 7 days around selectedDate (Monday to Sunday)
  const weekDays = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const dayIndex = (dt.getDay() + 6) % 7; // Monday = 0
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - dayIndex);

      return Array.from({ length: 7 }).map((_, i) => {
        const cur = new Date(monday);
        cur.setDate(monday.getDate() + i);
        const dateKey = toDateKey(cur.toISOString());
        return {
          dateKey,
          dayName: cur.toLocaleDateString("en-US", { weekday: "short" }),
          dayNumber: cur.getDate(),
          isToday: dateKey === todayKey,
          isSelected: dateKey === selectedDate,
          items: availabilities.filter((a) => a.date === dateKey),
        };
      });
    } catch {
      return [];
    }
  }, [selectedDate, todayKey, availabilities]);

  return (
    <div className="min-h-screen font-sans antialiased text-staff-ink">
      {/* Top bar controls */}
      <EmployeeTopBar
        employeeId={profile.id}
        employeeName={profile.full_name || "Alex Mercer"}
        employeeEmail={profile.email ?? null}
        employeeAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={profile.theme_preference ?? "light"}
        employeePosition={profile.position}
      />

      {/* Floating sidebar */}
      <StaffSidebar
        fullName={profile.full_name || "Alex Mercer"}
        position={profile.position}
        employeeId={profile.id}
        avatarUrl={profile.profile_picture_url}
      />

      <main className="mx-auto max-w-[1720px] px-4 pt-16 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12 flex flex-col gap-6">
        {/* Header with Title "My Schedule", live clock, notification, and "Add Availability" button */}
        <StaffHeader
          title="My Schedule"
          description="Manage your availability and let the team know when you're available."
          fullName={profile.full_name || "Alex Mercer"}
          employeeId={profile.id}
          employeeEmail={profile.email ?? null}
          employeeAvatarUrl={profile.profile_picture_url ?? null}
          initialTheme={profile.theme_preference ?? "light"}
          actionButton={
            <button
              type="button"
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-2 rounded-full bg-staff-blue hover:bg-staff-blue-dark text-white px-4 py-2 text-xs font-bold shadow-sm transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-staff-blue/40"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Availability</span>
            </button>
          }
          employeePosition={profile.position}
        />

        {/* Informational Disclaimer Banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-staff-border shadow-xs text-xs text-staff-body">
          <Info className="h-4 w-4 text-staff-blue-ink shrink-0" />
          <p className="font-medium leading-relaxed">
            <span className="font-bold text-staff-ink">Note:</span> Availability never
            clocks you in or out and never adds attendance or credited hours. It is used
            to coordinate team schedules and let supervisors know when you plan to work.
          </p>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold animate-fade-in transition-all ${
              toast.type === "success"
                ? "bg-staff-success-soft text-staff-success border-staff-success-border"
                : "bg-staff-danger-soft text-staff-danger border-staff-danger-border"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-staff-success" />
            ) : (
              <AlertCircle className="h-4 w-4 text-staff-danger" />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-current hover:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Empty State when no availabilities exist at all */}
        {!loading && availabilities.length === 0 && (
          <div className="rounded-[20px] bg-white border border-staff-border p-8 sm:p-12 text-center shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] flex flex-col items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-staff-soft text-staff-blue-ink flex items-center justify-center">
              <CalendarIcon className="h-8 w-8 stroke-[1.8]" />
            </div>
            <h3 className="text-xl font-extrabold text-staff-ink tracking-tight">
              Your schedule starts here
            </h3>
            <p className="text-sm text-staff-body max-w-md">
              Add your available days and times to organize your schedule and let your team
              know when you're available.
            </p>
            <button
              type="button"
              onClick={() => openAddModal()}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-staff-blue hover:bg-staff-blue-dark text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Availability</span>
            </button>
          </div>
        )}

        {/* 2-Column Responsive Layout: Calendar Card (Left) + Side Panel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Calendar Card (Left: cols 1-8) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="bg-white rounded-[20px] border border-staff-border p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] flex flex-col gap-5">
              {/* Calendar Controls Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Month Title & Prev/Next Navigation */}
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-staff-ink tracking-tight min-w-[170px]">
                    {monthTitle}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      aria-label="Previous month"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-staff-border hover:border-staff-blue text-staff-body hover:text-staff-blue-ink transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      aria-label="Next month"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-staff-border hover:border-staff-blue text-staff-body hover:text-staff-blue-ink transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Today button + Month / Week Segmented Switcher */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGoToToday}
                    className="px-3 py-1.5 rounded-full border border-staff-border text-xs font-bold text-staff-ink hover:border-staff-blue hover:text-staff-blue-ink bg-white transition-all shadow-2xs"
                  >
                    Today
                  </button>

                  <div className="inline-flex items-center p-1 rounded-full bg-staff-chip">
                    <button
                      type="button"
                      onClick={() => setViewMode("month")}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                        viewMode === "month"
                          ? "bg-white text-staff-ink shadow-sm font-bold"
                          : "text-staff-body hover:text-staff-ink"
                      }`}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>Month</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("week")}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                        viewMode === "week"
                          ? "bg-white text-staff-ink shadow-sm font-bold"
                          : "text-staff-body hover:text-staff-ink"
                      }`}
                    >
                      <ListFilter className="h-3.5 w-3.5" />
                      <span>Week</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* MONTH VIEW: Monday-first grid */}
              {viewMode === "month" && (
                <div className="overflow-x-auto">
                  <div className="min-w-[580px]">
                    {/* Day-of-week headers (Mon - Sun) */}
                    <div className="grid grid-cols-7 mb-2 text-center text-xs font-bold text-staff-body uppercase tracking-wider">
                      <div>Mon</div>
                      <div>Tue</div>
                      <div>Wed</div>
                      <div>Thu</div>
                      <div>Fri</div>
                      <div>Sat</div>
                      <div>Sun</div>
                    </div>

                    {/* Month Days Grid */}
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {calendarDays.map((cell) => {
                        const hasAvail = cell.items.length > 0;

                        return (
                          <div
                            key={cell.dateKey}
                            onClick={() => setSelectedDate(cell.dateKey)}
                            className={`group relative min-h-[76px] sm:min-h-[96px] p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                              cell.isSelected
                                ? "bg-staff-soft border-staff-blue ring-2 ring-staff-blue/20 shadow-sm"
                                : cell.isCurrentMonth
                                ? "bg-white border-staff-border hover:border-staff-blue/40 hover:bg-staff-card-2"
                                : "bg-staff-card-2 border-transparent text-staff-muted"
                            }`}
                          >
                            {/* Day Number Header */}
                            <div className="flex items-center justify-between">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                                  cell.isToday
                                    ? "bg-staff-blue text-white shadow-xs font-extrabold"
                                    : cell.isCurrentMonth
                                    ? "text-staff-ink"
                                    : "text-staff-muted"
                                }`}
                              >
                                {cell.dayNumber}
                              </span>

                              {/* Dot indicator on mobile / small screens */}
                              {hasAvail && (
                                <span className="sm:hidden h-2 w-2 rounded-full bg-staff-blue" />
                              )}
                            </div>

                            {/* Saved Availability Compact Time Pills (Desktop / Tablet) */}
                            <div className="hidden sm:flex flex-col gap-1 mt-1">
                              {cell.items.slice(0, 2).map((item) => {
                                const isUnavailable = item.status === "unavailable";
                                return (
                                  <div
                                    key={item.id}
                                    className={`truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                                      isUnavailable
                                        ? "border-staff-danger-border bg-staff-danger-soft text-staff-danger"
                                        : "border-staff-blue/20 bg-staff-soft text-staff-blue-ink"
                                    }`}
                                    title={`${formatTime12h(item.start_time)} – ${formatTime12h(
                                      item.end_time
                                    )}${item.notes ? ` (${item.notes})` : ""}`}
                                  >
                                    {formatTime12h(item.start_time)} –{" "}
                                    {formatTime12h(item.end_time)}
                                  </div>
                                );
                              })}
                              {cell.items.length > 2 && (
                                <span className="text-[9px] font-extrabold text-staff-blue-ink">
                                  +{cell.items.length - 2} more
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* WEEK VIEW: Seven columns with positioned time blocks */}
              {viewMode === "week" && (
                <div className="overflow-x-auto">
                  <div className="min-w-[680px] grid grid-cols-7 gap-2.5">
                    {weekDays.map((col) => {
                      return (
                        <div
                          key={col.dateKey}
                          onClick={() => setSelectedDate(col.dateKey)}
                          className={`flex flex-col rounded-2xl border p-3 min-h-[360px] transition-all cursor-pointer ${
                            col.isSelected
                              ? "bg-staff-card-2 border-staff-blue ring-2 ring-staff-blue/20"
                              : "bg-white border-staff-border hover:border-staff-blue/40"
                          }`}
                        >
                          {/* Column Header */}
                          <div className="text-center pb-2.5 border-b border-staff-border">
                            <p className="text-xs font-bold text-staff-body">
                              {col.dayName}
                            </p>
                            <span
                              className={`inline-flex h-7 w-7 mt-1 items-center justify-center rounded-full text-xs font-bold ${
                                col.isToday
                                  ? "bg-staff-blue text-white"
                                  : "text-staff-ink"
                              }`}
                            >
                              {col.dayNumber}
                            </span>
                          </div>

                          {/* Time Blocks for this day */}
                          <div className="flex flex-col gap-2 mt-3 flex-1">
                            {col.items.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-full text-center text-[11px] text-staff-muted py-8">
                                No slots
                              </div>
                            ) : (
                              col.items.map((it) => (
                                <div
                                  key={it.id}
                                  className="rounded-xl bg-staff-soft border border-staff-blue/20 p-2 text-left flex flex-col gap-1 shadow-2xs"
                                >
                                  <div className="flex items-center gap-1 text-[11px] font-extrabold text-staff-blue-ink">
                                    <Clock className="h-3 w-3 shrink-0" />
                                    <span>
                                      {formatTime12h(it.start_time)} –{" "}
                                      {formatTime12h(it.end_time)}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-semibold text-staff-body">
                                    {getDurationHours(it.start_time, it.end_time).toFixed(
                                      1
                                    )}
                                    h
                                  </span>
                                  {it.notes && (
                                    <p className="text-[10px] text-staff-ink truncate italic">
                                      {it.notes}
                                    </p>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Panel (Right: cols 9-12) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Monthly Summary Tile */}
            <div className="bg-white rounded-[20px] border border-staff-border p-5 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-staff-body uppercase tracking-wider">
                  This Month's Availability
                </span>
                <Sparkles className="h-4 w-4 text-staff-blue-ink" />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl bg-staff-card-2 border border-staff-border p-3 text-center">
                  <p className="text-2xl font-extrabold text-staff-ink">
                    {monthStats.daysCount}
                  </p>
                  <p className="text-xs font-semibold text-staff-body mt-0.5">
                    Available Days
                  </p>
                </div>
                <div className="rounded-xl bg-staff-card-2 border border-staff-border p-3 text-center">
                  <p className="text-2xl font-extrabold text-staff-blue-ink">
                    {monthStats.totalHours}h
                  </p>
                  <p className="text-xs font-semibold text-staff-body mt-0.5">
                    Total Hours
                  </p>
                </div>
              </div>
            </div>

            {/* Selected Date Detail Card */}
            <div className="bg-white rounded-[20px] border border-staff-border p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-staff-border pb-3">
                <div>
                  <span className="text-[11px] font-bold text-staff-blue-ink uppercase tracking-wider">
                    Selected Day
                  </span>
                  <h3 className="text-base font-extrabold text-staff-ink mt-0.5">
                    {selectedDateLabel}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => openAddModal(selectedDate)}
                  className="inline-flex items-center gap-1 rounded-full bg-staff-soft text-staff-blue-ink hover:bg-staff-blue hover:text-white px-2.5 py-1 text-xs font-bold transition-all"
                  title="Add availability for this date"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Add</span>
                </button>
              </div>

              {/* List of saved periods for the selected date */}
              <div className="flex flex-col gap-3">
                {selectedDateItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-staff-border py-8 text-center text-xs text-staff-body font-medium flex flex-col items-center gap-2">
                    <Clock className="h-5 w-5 text-staff-muted" />
                    <p>No availability saved for this date.</p>
                    <button
                      type="button"
                      onClick={() => openAddModal(selectedDate)}
                      className="mt-1 text-xs font-bold text-staff-blue-ink hover:underline"
                    >
                      + Add Availability
                    </button>
                  </div>
                ) : (
                  selectedDateItems.map((period) => {
                    const duration = getDurationHours(period.start_time, period.end_time);
                    const isDeleting = deletingId === period.id;
                    const isUnavailable = period.status === "unavailable";

                    return (
                      <div
                        key={period.id}
                        className="rounded-2xl border border-staff-border bg-white p-4 hover:border-staff-blue/30 transition-all flex flex-col gap-2.5 shadow-2xs"
                      >
                        {/* Time Range & Duration */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 text-sm font-extrabold text-staff-ink">
                              <Clock className="h-4 w-4 text-staff-blue-ink shrink-0" />
                              <span>
                                {formatTime12h(period.start_time)} –{" "}
                                {formatTime12h(period.end_time)}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-staff-body mt-0.5 pl-5">
                              Duration: {duration.toFixed(1)} hrs
                            </p>
                          </div>

                          {/* Status + recurring badges */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${
                                isUnavailable
                                  ? "border-staff-danger-border bg-staff-danger-soft text-staff-danger"
                                  : "border-staff-success-border bg-staff-success-soft text-staff-success"
                              }`}
                            >
                              {isUnavailable ? "Unavailable" : "Available"}
                            </span>
                            {period.series_id && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-staff-border bg-staff-card-2 px-2 py-0.5 text-[10.5px] font-bold text-staff-body">
                                <CalendarDays className="h-3 w-3" />
                                Repeats weekly
                              </span>
                            )}
                          </div>

                          {/* Action Buttons: Edit & Two-step Delete */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditModal(period)}
                              title="Edit"
                              className="p-1.5 rounded-lg text-staff-body hover:text-staff-blue-ink hover:bg-staff-soft transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            {isDeleting ? (
                              <div className="flex flex-wrap items-center gap-1 animate-fade-in">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(period.id)}
                                  className="px-2 py-0.5 rounded-lg bg-staff-danger-soft text-staff-danger text-[11px] font-bold hover:bg-staff-danger-solid hover:text-white transition-colors"
                                >
                                  Confirm
                                </button>
                                {period.series_id && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDelete(period.id, period.series_id)
                                    }
                                    title="Delete every entry created by this repeat"
                                    className="px-2 py-0.5 rounded-lg border border-staff-danger-border text-staff-danger text-[11px] font-bold hover:bg-staff-danger-soft transition-colors"
                                  >
                                    Whole series
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  className="p-1 rounded-lg text-staff-body hover:bg-slate-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(period.id)}
                                title="Delete"
                                className="p-1.5 rounded-lg text-staff-body hover:text-staff-danger hover:bg-staff-danger-soft transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Notes if present */}
                        {period.notes && (
                          <div className="rounded-xl bg-staff-card-2 border border-staff-border px-3 py-2 text-xs text-staff-body">
                            <span className="font-semibold text-staff-ink">Notes: </span>
                            <span>{period.notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ===================================================================
          ADD / EDIT AVAILABILITY MODAL (Fade & Scale transition)
          =================================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur & darkening */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity animate-fade-in"
            onClick={() => !isSaving && setModalOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative z-10 w-full max-w-md rounded-[20px] bg-white border border-staff-border p-6 shadow-2xl transition-all transform animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-staff-border pb-3.5">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-staff-blue-ink" />
                <h3 className="text-lg font-extrabold text-staff-ink">
                  {editingItem ? "Edit Availability" : "Add Availability"}
                </h3>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setModalOpen(false)}
                className="rounded-full p-1 text-staff-body hover:bg-slate-100 hover:text-staff-ink transition-colors disabled:text-staff-muted disabled:cursor-not-allowed"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAvailability} className="mt-4 flex flex-col gap-4">
              {/* Inline error display */}
              {modalError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-staff-danger-soft border border-staff-danger-border p-3 text-xs font-semibold text-staff-danger">
                  <AlertCircle className="h-4 w-4 shrink-0 text-staff-danger mt-0.5" />
                  <p className="leading-snug">{modalError}</p>
                </div>
              )}

              {/* Date Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-staff-ink">
                  Date <span className="text-staff-danger">*</span>
                </label>
                <input
                  type="date"
                  value={modalDate}
                  min={todayKey}
                  onChange={(e) => {
                    setModalDate(e.target.value);
                    clearFieldError("date");
                    if (!repeatWeekly) {
                      setRepeatWeekdays([new Date(`${e.target.value}T00:00:00`).getDay()]);
                    }
                  }}
                  required
                  className={`rounded-xl border bg-staff-card-2 px-3.5 py-2.5 text-xs font-semibold text-staff-ink outline-none transition-all cursor-pointer ${
                    fieldErrors.date
                      ? "border-staff-danger bg-staff-danger-soft"
                      : "border-staff-border focus:border-staff-blue focus:bg-staff-card focus:ring-2 focus:ring-staff-blue/20"
                  }`}
                />
                {fieldErrors.date && (
                  <p role="alert" className="text-[11px] font-semibold text-staff-danger">
                    {fieldErrors.date}
                  </p>
                )}
              </div>

              {/* Availability type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-staff-ink">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalStatus("available")}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
                      modalStatus === "available"
                        ? "border-staff-success-border bg-staff-success-soft text-staff-success"
                        : "border-staff-border bg-staff-card-2 text-staff-body hover:border-staff-border-strong"
                    }`}
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalStatus("unavailable")}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
                      modalStatus === "unavailable"
                        ? "border-staff-danger-border bg-staff-danger-soft text-staff-danger"
                        : "border-staff-border bg-staff-card-2 text-staff-body hover:border-staff-border-strong"
                    }`}
                  >
                    Unavailable
                  </button>
                </div>
              </div>

              {/* Time inputs: Start Time & End Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-staff-ink">
                    Start time <span className="text-staff-danger">*</span>
                  </label>
                  <input
                    type="time"
                    value={modalStartTime}
                    onChange={(e) => {
                      setModalStartTime(e.target.value);
                      clearFieldError("start");
                    }}
                    required
                    className={`rounded-xl border bg-staff-card-2 px-3 py-2.5 text-xs font-semibold text-staff-ink outline-none transition-all ${
                      fieldErrors.start
                        ? "border-staff-danger bg-staff-danger-soft"
                        : "border-staff-border focus:border-staff-blue focus:bg-staff-card focus:ring-2 focus:ring-staff-blue/20"
                    }`}
                  />
                  {fieldErrors.start && (
                    <p role="alert" className="text-[11px] font-semibold text-staff-danger">
                      {fieldErrors.start}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-staff-ink">
                    End time <span className="text-staff-danger">*</span>
                  </label>
                  <input
                    type="time"
                    value={modalEndTime}
                    onChange={(e) => {
                      setModalEndTime(e.target.value);
                      clearFieldError("end");
                    }}
                    required
                    className={`rounded-xl border bg-staff-card-2 px-3 py-2.5 text-xs font-semibold text-staff-ink outline-none transition-all ${
                      fieldErrors.end
                        ? "border-staff-danger bg-staff-danger-soft"
                        : "border-staff-border focus:border-staff-blue focus:bg-staff-card focus:ring-2 focus:ring-staff-blue/20"
                    }`}
                  />
                  {fieldErrors.end && (
                    <p role="alert" className="text-[11px] font-semibold text-staff-danger">
                      {fieldErrors.end}
                    </p>
                  )}
                </div>
              </div>

              {/* Repeat weekly (new entries only) */}
              {!editingItem && (
                <div className="flex flex-col gap-2 rounded-xl border border-staff-border bg-staff-card-2 p-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-staff-ink">
                    <input
                      type="checkbox"
                      checked={repeatWeekly}
                      onChange={(e) => {
                        setRepeatWeekly(e.target.checked);
                        if (e.target.checked && repeatWeekdays.length === 0) {
                          setRepeatWeekdays([
                            new Date(`${modalDate}T00:00:00`).getDay(),
                          ]);
                        }
                      }}
                      className="h-4 w-4 rounded border-staff-border-strong text-staff-blue-ink focus:ring-staff-blue/40"
                    />
                    Repeat weekly
                  </label>

                  {repeatWeekly && (
                    <div className="flex flex-col gap-2 animate-fade-in">
                      <div className="flex flex-wrap gap-1.5">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                          (label, dayIndex) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() =>
                                setRepeatWeekdays((prev) =>
                                  prev.includes(dayIndex)
                                    ? prev.filter((d) => d !== dayIndex)
                                    : [...prev, dayIndex]
                                )
                              }
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                repeatWeekdays.includes(dayIndex)
                                  ? "border-staff-blue bg-staff-soft text-staff-blue-ink"
                                  : "border-staff-border bg-white text-staff-body hover:border-staff-border-strong"
                              }`}
                            >
                              {label}
                            </button>
                          )
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-staff-ink">
                          Repeat until <span className="text-staff-danger">*</span>
                        </label>
                        <input
                          type="date"
                          value={repeatUntil}
                          min={modalDate}
                          onChange={(e) => setRepeatUntil(e.target.value)}
                          className="rounded-xl border border-staff-border bg-white px-3 py-2 text-xs font-semibold text-staff-ink outline-none focus:border-staff-blue focus:ring-2 focus:ring-staff-blue/20"
                        />
                        <p className="text-[10.5px] text-staff-body">
                          One entry is created per weekday — dates that clash with
                          your existing schedule are skipped and reported.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes (Optional) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-staff-ink">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="e.g. Morning shift, available for calls"
                  className="rounded-xl border border-staff-border bg-staff-card-2 px-3.5 py-2 text-xs text-staff-ink placeholder:text-staff-muted outline-none focus:border-staff-blue focus:bg-staff-card focus:ring-2 focus:ring-staff-blue/20 transition-all resize-none"
                />
              </div>

              {/* Action Buttons: Cancel & Save Availability */}
              <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-staff-border pt-3.5">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setModalOpen(false)}
                  className="rounded-full px-4 py-2 text-xs font-bold text-staff-body hover:bg-slate-100 hover:text-staff-ink transition-colors disabled:text-staff-muted disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-staff-blue hover:bg-staff-blue-dark px-5 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-95 disabled:bg-staff-chip disabled:text-staff-body disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Availability</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
