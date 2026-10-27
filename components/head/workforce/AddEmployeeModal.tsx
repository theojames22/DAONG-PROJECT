"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  X,
  User,
  Mail,
  Lock,
  Briefcase,
  ChevronDown,
  Minus,
  Plus,
  QrCode,
  Check,
  Loader2,
} from "lucide-react";
import ModalShell from "@/components/shared/ModalShell";
import styles from "@/app/head/workforce/workforce.module.css";

export interface AddEmployeeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AddEmployeeModal({ open, onClose }: AddEmployeeModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState("");
  const [requiredHours, setRequiredHours] = useState(40);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Move focus into the dialog's first field when it opens.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Position determines the dashboard and permissions —
      // the API derives the auth role from it.
      const res = await fetch("/api/head/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          position,
          required_weekly_hours: Number(requiredHours),
        }),
      });

      const body = await res.json();
      setIsSubmitting(false);

      if (!res.ok) {
        setError(body.error || "Could not create the employee account.");
        return;
      }

      // Reset and close
      setFullName("");
      setEmail("");
      setPassword("");
      setPosition("");
      setRequiredHours(40);
      onClose();
      router.refresh();
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Network error occurred.");
    }
  }

  const handlePositionChange = (newPos: string) => {
    setPosition(newPos);
    // Heads are administrators and have no required hours — Staff
    // clock in/out and keep a weekly target.
    if (newPos.toLowerCase() === "head") {
      setRequiredHours(0);
    } else if (requiredHours === 0) {
      setRequiredHours(40);
    }
  };

  const handleStepHours = (delta: number) => {
    setRequiredHours((prev) => Math.max(0, Math.min(80, prev + delta)));
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      ariaLabelledBy="modal-title"
      className={styles.modal}
    >
      {/* Pinned Header */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <UserPlus className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 id="modal-title" className="text-lg font-bold text-slate-900 leading-tight">
                Add employee
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Create their account. Staff get a QR code for time-in and time-out.
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
          id="add-employee-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-4 sm:px-7 sm:py-5 flex flex-col gap-4"
        >
          {/* Employee Preview Card matching reference image */}
          <div className="relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-500 p-4 text-white shadow-sm">
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
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-bold text-blue-600 shadow-sm">
                  +
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {fullName.trim() || "New employee"}
                  </p>
                  <span className="inline-block mt-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm truncate max-w-[140px]">
                    {position.trim() || "Staff"}
                  </span>
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
                placeholder="e.g. Maria Santos"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Email
            </label>
            <div className={`relative flex items-center rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white ${styles.field}`}>
              <Mail className="mr-2.5 h-4 w-4 text-slate-400 shrink-0" />
              <input
                required
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Temporary Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Temporary Password
            </label>
            <div className={`relative flex items-center rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white ${styles.field}`}>
              <Lock className="mr-2.5 h-4 w-4 text-slate-400 shrink-0" />
              <input
                required
                type="text"
                placeholder="Temporary password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 font-mono"
              />
            </div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              They&apos;ll sign in with this email and temporary password. Share these with them directly, and ask them to change their password after their first login.
            </p>
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

          {/* Required Hrs/Week Stepper & Presets */}
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
                {[40, 30, 20].map((hours) => (
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
                    {hours}h
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
              Attendance hours are always recorded, but only hours on days with a submitted output are credited toward this requirement.
            </p>
            <p className="text-[11.5px] leading-relaxed text-slate-500 -mt-1">
              Set it to 0 for a Head, who only manages the team.
            </p>
          </div>

          {/* QR Code Information Card */}
          <div className="flex items-start gap-3 rounded-2xl border border-blue-100/80 bg-blue-50/70 p-4 mb-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <QrCode className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900">
                QR code is created when you save
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                Staff scan it at the desk to clock in and out. You can reprint it at any time from their card.
              </p>
            </div>
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
            form="add-employee-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                Create account
              </>
            )}
          </button>
        </div>
    </ModalShell>
  );
}
