"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  UserCheck,
  X,
  User,
  Briefcase,
  ChevronDown,
  Minus,
  Plus,
  Check,
  Loader2,
  Shield,
} from "lucide-react";
import { Profile } from "@/lib/types";
import ModalShell from "@/components/shared/ModalShell";
import styles from "@/app/head/workforce/workforce.module.css";

export interface EditEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  employee: Profile | null;
}

export default function EditEmployeeModal({
  open,
  onClose,
  employee,
}: EditEmployeeModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [requiredHours, setRequiredHours] = useState(40);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Move focus into the dialog's first field when it opens.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (employee) {
      setFullName(employee.full_name || "");
      setPosition(employee.position || "");
      setRequiredHours(employee.required_weekly_hours ?? 40);
      setError(null);
    }
  }, [employee, open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !employee) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setError(null);
    setIsSubmitting(true);

    try {
      // Position determines the dashboard and permissions —
      // the API derives the auth role from it.
      const res = await fetch("/api/head/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: employee.id,
          full_name: fullName.trim(),
          position: position.trim(),
          required_weekly_hours: Number(requiredHours),
        }),
      });

      const body = await res.json();
      setIsSubmitting(false);

      if (!res.ok) {
        setError(body.error || "Could not update the account.");
        return;
      }

      onClose();
      router.refresh();
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Network error occurred.");
    }
  }

  const handleStepHours = (delta: number) => {
    setRequiredHours((prev) => Math.max(0, Math.min(80, prev + delta)));
  };

  // Heads are administrators and have no weekly requirement — Staff
  // clock in/out and keep a target.
  const handlePositionChange = (newPos: string) => {
    setPosition(newPos);
    if (newPos === "head") {
      setRequiredHours(0);
    } else if (requiredHours === 0) {
      setRequiredHours(40);
    }
  };

  const isHead = position === "head";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      ariaLabelledBy="edit-modal-title"
      className={styles.modal}
    >
      {/* Pinned Header */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <UserCheck className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 id="edit-modal-title" className="text-lg font-bold text-slate-900 leading-tight">
                Edit account
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Update account details, position, and weekly required hours.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          id="edit-employee-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-4 sm:px-7 sm:py-5 flex flex-col gap-4"
        >
          {/* Dynamic Employee Preview Card */}
          <div
            className={`relative shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-sm transition-all duration-300 ${
              isHead
                ? "bg-[#0f172a]"
                : "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-500"
            }`}
          >
            {/* Subtle decorative concentric SVG curves */}
            <svg
              className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-20"
              viewBox="0 0 120 120"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="60" cy="60" r="30" stroke="white" strokeWidth="2" />
              <circle cx="60" cy="60" r="50" stroke="white" strokeWidth="2" />
              <circle cx="60" cy="60" r="70" stroke="white" strokeWidth="2" />
            </svg>

            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-900 shadow-sm">
                  {(fullName.trim() || employee.full_name || "E").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {fullName.trim() || employee.full_name || "Employee"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm truncate max-w-[140px]">
                      {position.trim() || "Staff"}
                    </span>
                    {isHead && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200 backdrop-blur-sm">
                        <Shield className="h-3 w-3" /> Head
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-2xl font-black text-white tabular-nums tracking-tight">
                  {requiredHours}.0h
                </p>
                <p className="text-[10.5px] font-medium text-blue-100">required / week</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Full Name
            </label>
            <div className={`relative flex items-center rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white ${styles.field}`}>
              <User className="mr-2.5 h-4 w-4 text-slate-400 shrink-0" />
              <input
                required
                ref={firstFieldRef}
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Position — determines the dashboard and permissions */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Position
            </label>
            <div className={`relative flex items-center rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white ${styles.field}`}>
              <Briefcase className="mr-2.5 h-4 w-4 text-slate-400 shrink-0" />
              <select
                required
                value={position}
                onChange={(e) => handlePositionChange(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none appearance-none cursor-pointer pr-6"
              >
                <option value="">Select position</option>
                <option value="head">Head</option>
                <option value="staff">Staff</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              Head manages the team — dashboard, attendance, reports and approvals — and does not clock in/out. Staff clocks in/out with a QR code.
            </p>
          </div>

          {/* Required Hours Per Week */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Required Hrs/Week
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {/* Stepper */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStepHours(-5)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={requiredHours}
                  onChange={(e) => setRequiredHours(Math.max(0, Number(e.target.value) || 0))}
                  className={`h-9 w-16 rounded-xl border border-slate-200 text-center font-bold text-slate-900 outline-none text-sm ${styles.field}`}
                />
                <button
                  type="button"
                  onClick={() => handleStepHours(5)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium text-slate-500">hours</span>
              </div>

              {/* Quick Select Presets */}
              <div className="flex items-center gap-2">
                {[40, 30, 20, 0].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setRequiredHours(hours)}
                    className={`h-9 rounded-full px-3.5 text-xs font-semibold transition-all ${
                      requiredHours === hours
                        ? "border-2 border-blue-600 bg-blue-50 text-blue-600"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {hours === 0 ? "0h (Head)" : `${hours}h`}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
              Set it to 0 for a Head, who only manages the team.
            </p>
          </div>
        </form>

        {/* Pinned Modal Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:px-7 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-slate-200 px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-employee-form"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 stroke-[2.5]" />
                Save changes
              </>
            )}
          </button>
        </div>
    </ModalShell>
  );
}
