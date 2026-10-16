"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Loader2,
  Lock,
  Plus,
  Search,
  SearchX,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile, Equipment, EquipmentUsage } from "@/lib/types";
import {
  getWeekRange,
  toDateKey,
} from "@/lib/attendance";
import {
  formatDuration,
  formatUsageDate,
  formatUsageTime,
  isInWeek,
  isMissingColumnError,
  mostUsedEquipment,
} from "@/lib/equipment";
import LiveClockChip from "@/components/head/dashboard/LiveClockChip";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import ToastStack, { ToastData } from "@/components/ui/Toast";
import LogEquipmentModal from "./LogEquipmentModal";
import ManageEquipmentModal from "./ManageEquipmentModal";
import UsageRowActions from "./UsageRowActions";
import type { Theme } from "@/components/theme/ThemeProvider";

interface Filters {
  search: string;
  userId: string;
  equipmentId: string;
  from: string;
  to: string;
}

/** A pending Confirm/cancel/delete action awaiting confirmation. */
interface ConfirmState {
  kind: "cancel" | "delete";
  entry: EquipmentUsage;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  userId: "",
  equipmentId: "",
  from: "",
  to: "",
};

/**
 * The soft-cancel column (`cancelled_at`) is added by the latest
 * equipment_usage migration. Older deployments don't have it, and
 * PostgREST rejects the whole select with 42703 (undefined_column).
 * Fall back to the guaranteed columns so real records are never hidden
 * behind a misleading empty state.
 */
async function fetchUsageEntries(supabase: ReturnType<typeof createClient>) {
  const full = await supabase
    .from("equipment_usage")
    .select(
      "id, user_id, equipment_id, started_at, ended_at, duration_minutes, remarks, logged_by, cancelled_at, created_at"
    );

  if (!isMissingColumnError(full.error)) {
    return {
      data: (full.data ?? null) as EquipmentUsage[] | null,
      error: full.error,
    };
  }

  const basic = await supabase
    .from("equipment_usage")
    .select(
      "id, user_id, equipment_id, started_at, ended_at, duration_minutes, remarks, logged_by, created_at"
    );

  return {
    data: (basic.data ?? null) as EquipmentUsage[] | null,
    error: basic.error,
  };
}

export interface EquipmentUsageLogProps {
  admin: {
    id: string;
    full_name: string | null;
    email: string | null;
    position: string | null;
    profile_picture_url: string | null;
    theme_preference?: string | null;
  };
}

/**
 * Equipment usage log — Head only (the page gate checks the role).
 * Everything renders from the database: the summary figures, the
 * filter options and the history table.
 */
export default function EquipmentUsageLog({ admin }: EquipmentUsageLogProps) {
  const [entries, setEntries] = useState<EquipmentUsage[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // The radial row menu: only one record's menu may be open at a time.
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // Record being edited in the (reused) log modal — null means "create".
  const [editEntry, setEditEntry] = useState<EquipmentUsage | null>(null);
  // Pending cancel/delete confirmation.
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Whichever "Log equipment use" button opened the modal —
  // focus returns here when the modal closes.
  const logModalOpener = useRef<HTMLButtonElement | null>(null);

  const pushToast = useCallback(
    (type: "success" | "error", message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message }]);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const [profilesResult, equipmentResult, usageResult] = await Promise.all([
        // Staff and Heads are the accounts that use equipment.
        supabase
          .from("profiles")
          .select("id, full_name, position, role")
          .in("role", ["staff", "head"])
          .order("full_name"),
        supabase
          .from("equipment")
          .select("id, name, created_at")
          .order("name"),
        fetchUsageEntries(supabase),
      ]);

      // Supabase reports failures as returned values rather than thrown
      // errors, so surface them explicitly: a failed request must never
      // be rendered as "0 records".
      const failure =
        profilesResult.error ?? equipmentResult.error ?? usageResult.error;
      if (failure) {
        setLoadError(
          `Couldn't load the usage log (${failure.code ?? "error"}): ${
            failure.message
          }`
        );
        return;
      }

      setStaff((profilesResult.data ?? []) as Profile[]);
      setEquipment((equipmentResult.data ?? []) as Equipment[]);
      setEntries(usageResult.data ?? []);
    } catch (error) {
      setLoadError(
        `Couldn't load the usage log: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const staffById = useMemo(
    () => new Map(staff.map((person) => [person.id, person])),
    [staff]
  );
  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment]
  );

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.userId ||
      filters.equipmentId ||
      filters.from ||
      filters.to
  );

  // Newest first, then by creation time as a tiebreaker.
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const list = entries.filter((entry) => {
      if (filters.userId && entry.user_id !== filters.userId) return false;
      if (filters.equipmentId && entry.equipment_id !== filters.equipmentId)
        return false;
      const key = toDateKey(entry.started_at);
      if (filters.from && key < filters.from) return false;
      if (filters.to && key > filters.to) return false;
      if (q) {
        const userName = (staffById.get(entry.user_id)?.full_name ?? "").toLowerCase();
        const equipmentName = (
          equipmentById.get(entry.equipment_id)?.name ?? ""
        ).toLowerCase();
        const remarks = (entry.remarks ?? "").toLowerCase();
        if (
          !userName.includes(q) &&
          !equipmentName.includes(q) &&
          !remarks.includes(q)
        )
          return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      const diff =
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      return diff !== 0
        ? diff
        : (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [entries, filters, staffById, equipmentById]);

  // ---- Summary figures (this week, from live rows) ----
  // Cancelled bookings stay visible as history but no longer
  // count toward the figures or block availability.
  const activeEntries = useMemo(
    () => entries.filter((entry) => !entry.cancelled_at),
    [entries]
  );

  const { start: weekStart, end: weekEnd } = getWeekRange(new Date());
  const weekEntries = activeEntries.filter((entry) =>
    isInWeek(entry.started_at, weekStart, weekEnd)
  );
  const weekCount = weekEntries.length;
  const weekPeople = new Set(weekEntries.map((entry) => entry.user_id)).size;
  const weekMinutes = weekEntries.reduce(
    (sum, entry) => sum + Number(entry.duration_minutes || 0),
    0
  );
  const top = mostUsedEquipment(activeEntries);
  const topEquipment = top ? equipmentById.get(top.equipmentId) : null;

  const updateFilter = (patch: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setMenuOpenId(null);
  };

  const adminName = admin.full_name || "Head";

  // ---- Row actions (radial menu) ----
  const openEdit = (
    entry: EquipmentUsage,
    opener: HTMLButtonElement | null
  ) => {
    // Reuse the create modal in edit mode; focus returns to the toggle.
    logModalOpener.current = opener;
    setMenuOpenId(null);
    setEditEntry(entry);
    setLogModalOpen(true);
  };

  const askCancel = (entry: EquipmentUsage) => {
    setMenuOpenId(null);
    setConfirmError(null);
    setConfirmState({ kind: "cancel", entry });
  };

  const askDelete = (entry: EquipmentUsage) => {
    setMenuOpenId(null);
    setConfirmError(null);
    setConfirmState({ kind: "delete", entry });
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmState(null);
    setConfirmError(null);
  };

  // Runs the confirmed action. Cancel goes through the existing
  // soft-cancel workflow; delete goes through the booking endpoint's
  // DELETE (head-only by RLS). Success is only reported after the
  // database confirms, then the list and figures reload.
  const runConfirmed = useCallback(async () => {
    if (!confirmState || confirmBusy) return;
    const { kind, entry } = confirmState;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      const res = await fetch(
        kind === "delete"
          ? "/api/head/equipment/booking"
          : "/api/head/equipment/booking/cancel",
        {
          method: kind === "delete" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        }
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setConfirmError(
          body.error ||
            (kind === "delete"
              ? "Couldn't delete the entry."
              : "Couldn't cancel the booking.")
        );
        return;
      }

      pushToast(
        "success",
        kind === "delete" ? "Entry deleted" : "Booking cancelled"
      );
      setConfirmState(null);
      setConfirmError(null);
      await load();
    } catch {
      setConfirmError(
        kind === "delete"
          ? "Couldn't delete the entry. Please try again."
          : "Couldn't cancel the booking. Please try again."
      );
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmState, confirmBusy, pushToast, load]);

  // Human-readable summary of what the confirmation will affect.
  const confirmDescription = (() => {
    if (!confirmState) return "";
    const { kind, entry } = confirmState;
    const who = staffById.get(entry.user_id)?.full_name || "this user";
    const what =
      equipmentById.get(entry.equipment_id)?.name || "this equipment";
    const when = formatUsageDate(entry.started_at);
    return kind === "delete"
      ? `Permanently delete the ${what} entry for ${who} on ${when}? This can't be undone.`
      : `Cancel the ${what} entry for ${who} on ${when}? The record stays in the history as cancelled and stops blocking the equipment.`;
  })();

  return (
    <div className="relative flex flex-col gap-6 pb-24">
      {/* ============ Page header ============ */}
      <header className="relative z-30 flex flex-col gap-4 animate-fade-in pl-12 sm:pl-14 lg:pl-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mt-1 text-[40px] font-extrabold leading-tight tracking-tight text-[#0F1B3D]">
            Equipment usage log
          </h1>
          <p className="mt-1 max-w-xl text-sm font-normal text-[#55617F]">
            Record the equipment your team uses, so it&apos;s always clear who
            used what and when.
          </p>
        </div>

        {/* Action cluster — the same buttons every admin page uses */}
        <div className="relative z-40 flex flex-wrap items-center gap-2.5 self-start pt-1">
          <LiveClockChip />
          <NotificationBell
            userId={admin.id}
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
          <button
            type="button"
            onClick={(e) => {
              logModalOpener.current = e.currentTarget;
              setLogModalOpen(true);
            }}
            className="neu-focus flex h-12 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[13.5px] font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] hover:shadow-md active:translate-y-[-1px]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Log equipment use
          </button>
        </div>
      </header>

      {/* ============ Summary card ============ */}
      <section
        className="card-usage animate-fade-up grid grid-cols-1 divide-y divide-[#E6EBF5] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        aria-label="This week's equipment usage"
      >
        <SummaryFigure
          label="Entries this week"
          value={loading ? "—" : String(weekCount)}
          sub={
            loading
              ? "Loading…"
              : weekCount === 0
                ? "No one has logged use yet"
                : `By ${weekPeople} ${weekPeople === 1 ? "person" : "people"}`
          }
        />
        <SummaryFigure
          label="Time logged this week"
          value={loading ? "—" : formatDuration(weekMinutes)}
          sub="Across all equipment"
        />
        <SummaryFigure
          label="Most used equipment"
          value={
            loading ? "—" : topEquipment ? topEquipment.name : "—"
          }
          sub={
            loading
              ? "Loading…"
              : top
                ? `${top.count} ${top.count === 1 ? "entry" : "entries"} in total`
                : ""
          }
        />
      </section>

      {/* ============ Usage history card ============ */}
      <section className="card-usage animate-fade-up">
        {/* Card header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[17px] font-bold text-[#0F1B3D]">
              Usage history
            </h2>
            {loading && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                <span className="text-[13px] text-[#55617F]">
                  Loading entries
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="neu-focus flex h-11 items-center gap-1.5 rounded-full border border-[#E6EBF5] bg-white px-3 text-[12px] font-semibold text-[#55617F] transition-colors hover:border-[#CBD5E1] hover:text-[#0F1B3D]"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              Manage equipment
            </button>
            <span className="flex h-9 items-center gap-1.5 rounded-full bg-[#F1F5F9] px-3 text-[12px] font-semibold text-[#55617F]">
              <Lock className="h-3.5 w-3.5" />
              Only heads can edit
            </span>
          </div>
        </div>

        {/* Filter row */}
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
          {/* Search */}
          <div className="lg:col-span-2">
            <label
              htmlFor="usage-filter-search"
              className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
            >
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                id="usage-filter-search"
                type="search"
                value={filters.search}
                onChange={(e) => updateFilter({ search: e.target.value })}
                placeholder="Equipment, user or remarks"
                className="h-11 w-full rounded-xl border border-[#E6EBF5] bg-white pl-10 pr-3.5 text-[13px] text-[#0F1B3D] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>
          </div>

          {/* User */}
          <div>
            <label
              htmlFor="usage-filter-user"
              className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
            >
              User
            </label>
            <div className="relative">
              <select
                id="usage-filter-user"
                value={filters.userId}
                onChange={(e) => updateFilter({ userId: e.target.value })}
                className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#E6EBF5] bg-white px-3.5 pr-9 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              >
                <option value="">All users</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name || "Unnamed"}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </div>
          </div>

          {/* Equipment */}
          <div>
            <label
              htmlFor="usage-filter-equipment"
              className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
            >
              Equipment
            </label>
            <div className="relative">
              <select
                id="usage-filter-equipment"
                value={filters.equipmentId}
                onChange={(e) =>
                  updateFilter({ equipmentId: e.target.value })
                }
                className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-[#E6EBF5] bg-white px-3.5 pr-9 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              >
                <option value="">All equipment</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </div>
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="usage-filter-from"
                className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
              >
                From date
              </label>
              <input
                id="usage-filter-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => updateFilter({ from: e.target.value })}
                className="h-11 w-full rounded-xl border border-[#E6EBF5] bg-white px-3 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>
            <div>
              <label
                htmlFor="usage-filter-to"
                className="mb-1.5 block text-[12px] font-semibold text-[#55617F]"
              >
                To date
              </label>
              <input
                id="usage-filter-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => updateFilter({ to: e.target.value })}
                className="h-11 w-full rounded-xl border border-[#E6EBF5] bg-white px-3 text-[13px] text-[#0F1B3D] outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>
          </div>
        </div>

        {/* Clear filters — only while a filter is active */}
        {hasActiveFilters && (
          <div className="px-5 pb-3 sm:px-6">
            <button
              type="button"
              onClick={clearFilters}
              className="neu-focus rounded-lg px-1 py-2 text-[12.5px] font-semibold text-[#2563EB] underline-offset-2 transition-colors hover:text-[#1D4ED8] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Table area */}
        <div className="relative px-2 sm:px-3">
          {/* Loading veil — dims the table, never a blank card */}
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[20px] bg-white/70 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                <span className="text-[13px] font-medium text-[#55617F]">
                  Loading entries
                </span>
              </div>
            </div>
          )}

          {loadError ? (
            <p className="px-4 py-10 text-center text-[13px] font-medium text-[#991B1B]">
              {loadError}
            </p>
          ) : entries.length === 0 && !loading ? (
            /* ---- No records at all ---- */
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-sm">
                <Wrench className="h-7 w-7" strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-[15px] font-bold text-[#0F1B3D]">
                No equipment logged yet
              </h3>
              <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#55617F]">
                When your team uses equipment, log it here so there&apos;s a
                clear record of who used what and when.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  logModalOpener.current = e.currentTarget;
                  setLogModalOpen(true);
                }}
                className="neu-focus mt-5 flex h-12 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[13.5px] font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] hover:shadow-md active:translate-y-[-1px]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Log equipment use
              </button>
            </div>
          ) : filtered.length === 0 && !loading ? (
            /* ---- Records exist, but the filters exclude them all ---- */
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E4EDFF] text-[#2563EB]">
                <SearchX className="h-7 w-7" strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-[15px] font-bold text-[#0F1B3D]">
                No entries match these filters
              </h3>
              <button
                type="button"
                onClick={clearFilters}
                className="neu-focus mt-5 flex h-11 items-center rounded-full border border-[#E6EBF5] bg-[#E4EDFF] px-5 text-[13px] font-semibold text-[#1D4ED8] transition-colors hover:bg-[#D6E4FF]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            /* ---- History table ---- */
            <div className="overflow-x-auto pb-2">
              <table className="usage-table w-full min-w-[780px] text-left text-[13px]">
                <thead>
                  <tr className="bg-[#F3F7FE]">
                    <th className="rounded-l-xl px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                      Date and time
                    </th>
                    <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                      User
                    </th>
                    <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                      Equipment
                    </th>
                    <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                      Duration
                    </th>
                    <th className="px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                      Remarks
                    </th>
                    <th className="rounded-r-xl px-4 py-2.5 text-[12px] font-semibold text-[#55617F]">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, index) => {
                    const person = staffById.get(entry.user_id);
                    const item = equipmentById.get(entry.equipment_id);
                    const initial = (
                      person?.full_name?.trim() || "?"
                    ).charAt(0).toUpperCase();
                    const isCancelled = Boolean(entry.cancelled_at);
                    return (
                      <tr
                        key={entry.id}
                        className={`animate-fade-in ${
                          isCancelled ? "opacity-60" : ""
                        }`}
                        style={{
                          animationDelay: `${Math.min(index * 40, 400)}ms`,
                        }}
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-[#0F1B3D]">
                            {formatUsageDate(entry.started_at)}
                          </p>
                          <p className="mt-0.5 text-[12px] text-[#55617F]">
                            {formatUsageTime(entry.started_at)} –{" "}
                            {formatUsageTime(entry.ended_at)}
                          </p>
                          {isCancelled && (
                            <span className="mt-1 inline-flex items-center rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10.5px] font-semibold text-[#55617F]">
                              Cancelled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E4EDFF] text-[11px] font-bold text-[#2563EB]"
                            >
                              {initial}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[#0F1B3D]">
                                {person?.full_name || "Unknown"}
                              </p>
                              <p className="truncate text-[12px] text-[#55617F]">
                                {person?.position || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-[#0F1B3D]">
                          {item?.name || "Unknown"}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                              isCancelled
                                ? "bg-[#F1F5F9] text-[#55617F] line-through"
                                : "bg-[#E4EDFF] text-[#1D4ED8]"
                            }`}
                          >
                            {formatDuration(entry.duration_minutes)}
                          </span>
                        </td>
                        <td className="max-w-[220px] px-4 py-3.5 text-[#55617F]">
                          {entry.remarks ? (
                            <span className="block truncate">
                              {entry.remarks}
                            </span>
                          ) : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <UsageRowActions
                            entry={entry}
                            open={menuOpenId === entry.id}
                            label={item?.name || "this entry"}
                            onToggle={(id) =>
                              setMenuOpenId((prev) =>
                                prev === id ? null : id
                              )
                            }
                            onClose={() => setMenuOpenId(null)}
                            onEdit={openEdit}
                            onCancel={askCancel}
                            onDelete={askDelete}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !loadError && entries.length > 0 && (
          <div className="px-5 py-4 sm:px-6">
            <p className="text-[12.5px] text-[#55617F]">
              Showing {filtered.length} of {entries.length}{" "}
              {entries.length === 1 ? "entry" : "entries"}
            </p>
          </div>
        )}
      </section>

      {/* ============ Faint wave lines drifting along the bottom ============ */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
        aria-hidden="true"
      >
        <svg
          className="animate-wave-drift h-36 w-[200%]"
          viewBox="0 0 1200 144"
          preserveAspectRatio="none"
          fill="none"
        >
          {[24, 52, 80, 108].map((y) => (
            <path
              key={y}
              d={`M0,${y} C100,${y - 22} 200,${y + 22} 300,${y} C400,${
                y - 22
              } 500,${y + 22} 600,${y} C700,${y - 22} 800,${y + 22} 900,${y} C1000,${y - 22} 1100,${y + 22} 1200,${y}`}
              stroke="#2563EB"
              strokeOpacity="0.06"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>

      {/* ============ Modals ============ */}
      <LogEquipmentModal
        open={logModalOpen}
        onClose={() => {
          setLogModalOpen(false);
          setEditEntry(null);
        }}
        staff={staff}
        equipment={equipment}
        entry={editEntry}
        onToast={pushToast}
        onSaved={load}
        openerRef={logModalOpener}
      />
      <ManageEquipmentModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        equipment={equipment}
        onChange={setEquipment}
        onToast={pushToast}
      />
      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.kind === "delete"
            ? "Delete this entry?"
            : "Cancel this booking?"
        }
        description={confirmDescription}
        confirmLabel={
          confirmState?.kind === "delete" ? "Delete entry" : "Cancel booking"
        }
        cancelLabel={
          confirmState?.kind === "delete" ? "Keep entry" : "Keep booking"
        }
        tone={confirmState?.kind === "delete" ? "danger" : "warning"}
        icon={
          confirmState?.kind === "delete" ? (
            <Trash2 className="h-5 w-5" />
          ) : (
            <Ban className="h-5 w-5" />
          )
        }
        busy={confirmBusy}
        error={confirmError}
        onConfirm={runConfirmed}
        onClose={closeConfirm}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={admin.id}
        userName={adminName}
        userEmail={admin.email}
        userAvatarUrl={admin.profile_picture_url}
        initialTheme={(admin.theme_preference as Theme) ?? "light"}
        position={admin.position}
      />

      {/* ============ Toasts ============ */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function SummaryFigure({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-[#55617F]">
        {label}
      </p>
      <p className="mt-2.5 text-[30px] font-black leading-none tracking-tight text-[#0F1B3D]">
        {value}
      </p>
      {sub && (
        <p className="mt-2 text-[12.5px] text-[#55617F]">{sub}</p>
      )}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
