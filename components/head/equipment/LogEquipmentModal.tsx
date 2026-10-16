"use client";

import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import {
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile, Equipment, EquipmentUsage } from "@/lib/types";
import {
  buildUsageRange,
  durationMinutesBetween,
  formatDuration,
  formatUsageTime,
  isMissingColumnError,
  todayDateKey,
  toTimeInputValue,
} from "@/lib/equipment";
import { toDateKey } from "@/lib/attendance";
import ModalShell from "@/components/shared/ModalShell";

interface LogEquipmentModalProps {
  open: boolean;
  onClose: () => void;
  /** Accounts that can be picked as the user (staff + heads). */
  staff: Profile[];
  equipment: Equipment[];
  onToast: (type: "success" | "error", message: string) => void;
  onSaved: () => void;
  /** Button that opened the modal — receives focus back on close. */
  openerRef?: { current: HTMLButtonElement | null };
  /** When set, the dialog edits this record instead of creating one. */
  entry?: EquipmentUsage | null;
}

const FIELD_IDS = {
  userId: "log-user",
  equipmentId: "log-equipment",
  date: "log-date",
  startTime: "log-start",
  endTime: "log-end",
} as const;

const EQUIPMENT_CONFLICT =
  "This equipment is already reserved for the selected time. Please choose another time.";
const PERSON_CONFLICT =
  "You already have a booking during this time. Please choose another schedule.";

interface Conflict {
  field: "user" | "equipment";
  message: string;
}

type AvailabilityStatus = "available" | "reserved" | "in_use";

interface Availability {
  status: AvailabilityStatus;
  ranges: { start: string; end: string }[];
}

const AVAILABILITY_STYLES: Record<
  AvailabilityStatus,
  { label: string; className: string }
> = {
  available: {
    label: "Available",
    className: "bg-[#DCFCE7] text-[#166534]",
  },
  reserved: {
    label: "Reserved",
    className: "bg-[#FEF3C7] text-[#92400E]",
  },
  in_use: {
    label: "In use",
    className: "bg-[#FEE2E2] text-[#991B1B]",
  },
};

/**
 * "Log / edit equipment use" dialog. Before a booking can be saved the
 * dialog checks the equipment's availability and both conflict rules
 * (same equipment, same person) against live rows. In edit mode the
 * record's own row is excluded from every check so it can never conflict
 * with itself. Everything is validated up front and the form keeps its
 * values on failure.
 */
export default function LogEquipmentModal({
  open,
  onClose,
  staff,
  equipment,
  onToast,
  onSaved,
  openerRef,
  entry,
}: LogEquipmentModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const isEditing = Boolean(entry);

  const [userId, setUserId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [date, setDate] = useState(todayDateKey());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset (or prefill) the form every time the dialog opens.
  useEffect(() => {
    if (open) {
      setUserId(entry ? entry.user_id : "");
      setEquipmentId(entry ? entry.equipment_id : "");
      setDate(entry ? toDateKey(entry.started_at) : todayDateKey());
      setStartTime(entry ? toTimeInputValue(entry.started_at) : "");
      setEndTime(entry ? toTimeInputValue(entry.ended_at) : "");
      setRemarks(entry?.remarks ?? "");
      setErrors({});
      setConflict(null);
      setAvailability(null);
      setChecking(false);
      setCheckError(null);
      setIsSaving(false);
      // Focus the first field once the portal has mounted.
      const timer = window.setTimeout(
        () => document.getElementById(FIELD_IDS.userId)?.focus(),
        0
      );
      return () => window.clearTimeout(timer);
    }
    // Return focus to the button that opened the modal.
    openerRef?.current?.focus();
    return undefined;
  }, [open, entry, openerRef]);

  // Keep focus inside the dialog while it's open.
  useEffect(() => {
    if (!open) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const dialogEl = dialogRef.current;
      if (!dialogEl) return;
      const focusables = dialogEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open]);

  // ---- Availability for the chosen equipment + date ----
  useEffect(() => {
    if (!open || !equipmentId || !date) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const dayStart = new Date(`${date}T00:00:00`).toISOString();
      const dayEnd = new Date(`${date}T23:59:59.999`).toISOString();

      const buildDayBookings = (withCancelFilter: boolean) => {
        let query = supabase
          .from("equipment_usage")
          .select("id, started_at, ended_at")
          .eq("equipment_id", equipmentId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd);
        // Editing: don't list the record's own row as a booking.
        if (entry) query = query.neq("id", entry.id);
        return (withCancelFilter ? query.is("cancelled_at", null) : query).order(
          "started_at"
        );
      };

      let result = await buildDayBookings(true);
      if (isMissingColumnError(result.error)) {
        // Schema drift: the soft-cancel column isn't deployed yet.
        result = await buildDayBookings(false);
      }

      if (cancelled) return;

      // A failed lookup must never masquerade as "Available".
      if (result.error) {
        setAvailability(null);
        return;
      }

      const ranges = (result.data ?? []) as {
        id: string;
        started_at: string;
        ended_at: string;
      }[];
      const now = Date.now();
      const isToday = toDateKey(new Date().toISOString()) === date;
      const inUse =
        isToday &&
        ranges.some(
          (r) =>
            now >= new Date(r.started_at).getTime() &&
            now < new Date(r.ended_at).getTime()
        );

      setAvailability({
        status: inUse ? "in_use" : ranges.length > 0 ? "reserved" : "available",
        ranges: ranges.map((r) => ({ start: r.started_at, end: r.ended_at })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, equipmentId, date, supabase, entry]);

  // ---- Live conflict check once every field is filled ----
  useEffect(() => {
    if (
      !open ||
      !userId ||
      !equipmentId ||
      !date ||
      !startTime ||
      !endTime ||
      endTime <= startTime ||
      date > todayDateKey()
    ) {
      setConflict(null);
      setChecking(false);
      setCheckError(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    // Small debounce so typing the times doesn't spam the query.
    const timer = window.setTimeout(async () => {
      const { startedAt, endedAt } = buildUsageRange(date, startTime, endTime);

      const buildConflict = (
        column: "equipment_id" | "user_id",
        value: string,
        withCancelFilter: boolean
      ) => {
        let query = supabase
          .from("equipment_usage")
          .select("id")
          .eq(column, value)
          .lt("started_at", endedAt)
          .gt("ended_at", startedAt);
        // Editing: a record never conflicts with itself.
        if (entry) query = query.neq("id", entry.id);
        return (withCancelFilter ? query.is("cancelled_at", null) : query).limit(1);
      };

      const runChecks = (withCancelFilter: boolean) =>
        Promise.all([
          buildConflict("equipment_id", equipmentId, withCancelFilter),
          buildConflict("user_id", userId, withCancelFilter),
        ]);

      let [equipmentConflict, personConflict] = await runChecks(true);
      if (
        isMissingColumnError(equipmentConflict.error) ||
        isMissingColumnError(personConflict.error)
      ) {
        // Schema drift: the soft-cancel column isn't deployed yet.
        [equipmentConflict, personConflict] = await runChecks(false);
      }

      if (cancelled) return;
      setChecking(false);

      // Never trust a failed check: block the save and say so rather
      // than silently assuming there is no conflict.
      const checkFailure = equipmentConflict.error ?? personConflict.error;
      if (checkFailure) {
        setCheckError(
          `Couldn't verify booking conflicts (${
            checkFailure.code ?? "error"
          }). Please try again.`
        );
        setConflict(null);
        return;
      }

      setCheckError(null);
      if (equipmentConflict.data && equipmentConflict.data.length > 0) {
        setConflict({ field: "equipment", message: EQUIPMENT_CONFLICT });
      } else if (personConflict.data && personConflict.data.length > 0) {
        setConflict({ field: "user", message: PERSON_CONFLICT });
      } else {
        setConflict(null);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, userId, equipmentId, date, startTime, endTime, supabase, entry]);

  const clearError = (field: string) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!userId) next.userId = "Choose a staff member from the list.";
    if (!equipmentId) next.equipmentId = "Choose equipment from the list.";
    if (!date || date > todayDateKey()) {
      next.date = "Usage can't be in the future.";
    }
    if (!startTime) next.startTime = "Choose a start time.";
    if (!endTime) {
      next.endTime = "Choose an end time.";
    } else if (startTime && endTime <= startTime) {
      next.endTime = "End time must be later than the start time.";
    }
    return next;
  }

  const durationMinutes = durationMinutesBetween(date, startTime, endTime);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    // Never close while saving — the guard below also covers
    // Escape, the backdrop and the X button.
    if (isSaving) return;
    // Unresolved conflict or unverifiable check — the button stays disabled.
    if (conflict || checkError) return;

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstError = Object.keys(nextErrors)[0];
      document
        .getElementById(FIELD_IDS[firstError as keyof typeof FIELD_IDS])
        ?.focus();
      return;
    }

    setIsSaving(true);
    try {
      const { startedAt, endedAt } = buildUsageRange(date, startTime, endTime);
      const target = entry;
      // Create or update — both re-check the conflict rules server-side
      // (the update excludes its own row) and the DB constraints are the
      // final guard. The server recomputes the duration either way.
      const res = await fetch("/api/head/equipment/booking", {
        method: target ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          target
            ? {
                id: target.id,
                user_id: userId,
                equipment_id: equipmentId,
                started_at: startedAt,
                ended_at: endedAt,
                remarks: remarks.trim() || null,
              }
            : {
                user_id: userId,
                equipment_id: equipmentId,
                started_at: startedAt,
                ended_at: endedAt,
                duration_minutes: durationMinutes,
                remarks: remarks.trim() || null,
              }
        ),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && (body.field === "user" || body.field === "equipment")) {
        // Race: someone reserved the same slot while this dialog
        // was open. Highlight the field that now conflicts.
        setConflict({ field: body.field, message: body.message });
        setIsSaving(false);
        return;
      }

      if (!res.ok) {
        throw new Error(body.error || "Could not save the entry.");
      }

      onToast(
        "success",
        target ? "Equipment use updated" : "Equipment use logged"
      );
      onSaved();
      onClose();
    } catch {
      onToast(
        "error",
        isEditing
          ? "Couldn't save the changes. Please try again."
          : "Couldn't save the entry. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Guarded close — Escape, backdrop clicks and the X button
  // are all blocked while the entry is being saved.
  const guardedClose = () => {
    if (!isSaving) onClose();
  };

  const fieldError = (field: string): string | null =>
    errors[field] ?? (conflict?.field === field ? conflict.message : null);

  const inputClass = (field: string) =>
    `h-11 w-full rounded-xl border bg-white px-3.5 text-[13px] text-[#0F1B3D] outline-none transition-colors placeholder:text-[#94A3B8] ${
      fieldError(field)
        ? "border-[#991B1B]"
        : "border-[#E6EBF5] hover:border-[#CBD5E1] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
    }`;

  const labelClass =
    "mb-1.5 block text-[12px] font-semibold text-[#55617F]";

  const errorClass = "mt-1.5 text-[12.5px] font-medium text-[#991B1B]";

  const clearConflict = () => setConflict(null);

  return (
    <ModalShell
      open={open}
      onClose={guardedClose}
      maxWidthClass="max-w-[500px]"
      ariaLabelledBy="log-equipment-title"
      className="!rounded-[22px] animate-modal-in"
    >
      <div ref={dialogRef} className="flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 sm:px-7">
          <div>
            <h2
              id="log-equipment-title"
              className="text-[17px] font-bold text-[#0F1B3D]"
            >
              {isEditing ? "Edit equipment use" : "Log equipment use"}
            </h2>
            <p className="mt-1 text-[12.5px] text-[#55617F]">
              {isEditing
                ? "Update the details below and save your changes."
                : "The entry is saved to the log, and Heads can correct it later."}
            </p>
          </div>
          <button
            type="button"
            onClick={guardedClose}
            disabled={isSaving}
            aria-label="Close"
            className="neu-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E6EBF5] text-[#94A3B8] transition-colors hover:border-[#CBD5E1] hover:text-[#0F1B3D] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form
          id="log-equipment-form"
          onSubmit={handleSave}
          className="flex-1 overflow-y-auto px-6 py-5 sm:px-7"
        >
          <div className="flex flex-col gap-4">
            {/* User */}
            <div>
              <label htmlFor={FIELD_IDS.userId} className={labelClass}>
                User
              </label>
              <div className="relative">
                <select
                  id={FIELD_IDS.userId}
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    clearError("userId");
                    clearConflict();
                  }}
                  className={`${inputClass(
                    "userId"
                  )} cursor-pointer appearance-none pr-9`}
                >
                  <option value="">Choose who used it</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || "Unnamed"}
                      {person.position ? ` — ${person.position}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#55617F]">
                You&apos;re recording this on their behalf. The entry also
                stores that you logged it.
              </p>
              {fieldError("userId") && (
                <p role="alert" className={errorClass}>
                  {fieldError("userId")}
                </p>
              )}
            </div>

            {/* Equipment */}
            <div>
              <label htmlFor={FIELD_IDS.equipmentId} className={labelClass}>
                Equipment
              </label>
              <div className="relative">
                <select
                  id={FIELD_IDS.equipmentId}
                  value={equipmentId}
                  onChange={(e) => {
                    setEquipmentId(e.target.value);
                    clearError("equipmentId");
                    clearConflict();
                  }}
                  className={`${inputClass(
                    "equipmentId"
                  )} cursor-pointer appearance-none pr-9`}
                >
                  <option value="">Choose equipment</option>
                  {equipment.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              </div>

              {/* Availability before confirming the booking */}
              {availability && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                      AVAILABILITY_STYLES[availability.status].className
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {AVAILABILITY_STYLES[availability.status].label}
                  </span>
                  {availability.ranges.length > 0 ? (
                    <span className="text-[11.5px] text-[#55617F]">
                      Booked:{" "}
                      {availability.ranges
                        .map(
                          (r) =>
                            `${formatUsageTime(r.start)} – ${formatUsageTime(
                              r.end
                            )}`
                        )
                        .join(", ")}
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-[#55617F]">
                      No bookings on this date.
                    </span>
                  )}
                </div>
              )}

              {fieldError("equipmentId") && (
                <p role="alert" className={errorClass}>
                  {fieldError("equipmentId")}
                </p>
              )}
            </div>

            {/* Date used */}
            <div>
              <label htmlFor={FIELD_IDS.date} className={labelClass}>
                Date used
              </label>
              <input
                id={FIELD_IDS.date}
                type="date"
                value={date}
                max={todayDateKey()}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearError("date");
                  clearConflict();
                }}
                className={inputClass("date")}
              />
              {fieldError("date") && (
                <p role="alert" className={errorClass}>
                  {fieldError("date")}
                </p>
              )}
            </div>

            {/* Start / End time — side by side, stacked on mobile */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={FIELD_IDS.startTime} className={labelClass}>
                  Start time
                </label>
                <input
                  id={FIELD_IDS.startTime}
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    clearError("startTime");
                    clearConflict();
                  }}
                  className={inputClass("startTime")}
                />
                {fieldError("startTime") && (
                  <p role="alert" className={errorClass}>
                    {fieldError("startTime")}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={FIELD_IDS.endTime} className={labelClass}>
                  End time
                </label>
                <input
                  id={FIELD_IDS.endTime}
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    clearError("endTime");
                    clearConflict();
                  }}
                  className={inputClass("endTime")}
                />
                {fieldError("endTime") && (
                  <p role="alert" className={errorClass}>
                    {fieldError("endTime")}
                  </p>
                )}
              </div>
            </div>

            {/* Duration — only once both times are valid */}
            {durationMinutes > 0 && (
              <p className="rounded-xl bg-[#E4EDFF] px-3.5 py-2.5 text-[13px] font-semibold text-[#1D4ED8]">
                Duration: {formatDuration(durationMinutes)}
              </p>
            )}

            {/* Remarks */}
            <div>
              <label htmlFor="log-remarks" className={labelClass}>
                Remarks{" "}
                <span className="font-normal text-[#94A3B8]">(optional)</span>
              </label>
              <textarea
                id="log-remarks"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Condition, issues or anything worth noting"
                className="w-full resize-none rounded-xl border border-[#E6EBF5] bg-white px-3.5 py-2.5 text-[13px] text-[#0F1B3D] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>

            {/* Failed availability/conflict check — surfaced, not ignored */}
            {checkError && (
              <p
                role="alert"
                className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#991B1B]"
              >
                {checkError}
              </p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E6EBF5] px-6 py-4 sm:px-7">
          <button
            type="button"
            onClick={guardedClose}
            disabled={isSaving}
            className="neu-focus h-11 rounded-xl border border-[#E6EBF5] bg-[#F1F5F9] px-5 text-[13px] font-semibold text-[#55617F] transition-colors hover:border-[#CBD5E1] hover:text-[#0F1B3D] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="log-equipment-form"
            disabled={isSaving || conflict !== null || checking || checkError !== null}
            className="neu-focus flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] hover:shadow-md active:translate-y-[-1px] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : checking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : isEditing ? (
              <>
                <Pencil className="h-4 w-4" strokeWidth={2.5} />
                Save changes
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Save entry
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
