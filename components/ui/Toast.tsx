"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface ToastData {
  id: number;
  type: "success" | "error";
  message: string;
}

const TOAST_DURATION_MS = 3500;

/**
 * Minimal toast stack — slides up from the bottom and
 * dismisses itself after ~3.5s. Uses role="status" so
 * screen readers announce it. All motion respects the
 * global prefers-reduced-motion rule in globals.css.
 */
export default function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[110] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 sm:bottom-6"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(
      () => onDismiss(toast.id),
      TOAST_DURATION_MS
    );
    return () => window.clearTimeout(id);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.type === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      className={`animate-toast-up flex w-full items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] font-semibold shadow-lg ${
        isSuccess ? "bg-[#0F1B3D] text-white" : "bg-[#991B1B] text-white"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
      <span className="min-w-0 flex-1 truncate text-left">{toast.message}</span>
    </div>
  );
}
