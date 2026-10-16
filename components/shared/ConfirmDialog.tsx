"use client";

import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "@/components/shared/ModalShell";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** Label on the confirming button, e.g. "Delete entry". */
  confirmLabel: string;
  /** Label on the dismissing button, e.g. "Keep entry". */
  cancelLabel?: string;
  /** danger = destructive (red), warning = reversible (amber). */
  tone?: "danger" | "warning";
  /** Icon rendered inside the coloured badge. */
  icon?: ReactNode;
  /** Disables both buttons and shows a spinner while the action runs. */
  busy?: boolean;
  /** Real error from the action — surfaced instead of a fake success. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

const TONES = {
  danger: {
    badge: "bg-[#FEE2E2] text-[#DC2626]",
    button:
      "bg-[#DC2626] shadow-sm hover:bg-[#B91C1C] active:translate-y-[-1px]",
  },
  warning: {
    badge: "bg-[#FEF3C7] text-[#B45309]",
    button:
      "bg-[#D97706] shadow-sm hover:bg-[#B45309] active:translate-y-[-1px]",
  },
} as const;

/**
 * Reusable confirmation dialog for destructive/reversible Head actions.
 * Blocks dismissal while `busy` so an in-flight request can't be
 * double-submitted, and renders the real error when the action fails.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Go back",
  tone = "danger",
  icon,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const requestClose = () => {
    if (!busy) onClose();
  };

  const styles = TONES[tone];

  return (
    <ModalShell
      open={open}
      onClose={requestClose}
      maxWidthClass="max-w-[430px]"
      ariaLabelledBy="confirm-dialog-title"
      className="!rounded-[22px] animate-modal-in"
    >
      <div className="flex flex-col p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${styles.badge}`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2
              id="confirm-dialog-title"
              className="text-[16px] font-bold text-[#0F1B3D]"
            >
              {title}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#55617F]">
              {description}
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#991B1B]"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="neu-focus h-11 rounded-xl border border-[#E6EBF5] bg-[#F1F5F9] px-5 text-[13px] font-semibold text-[#55617F] transition-colors hover:border-[#CBD5E1] hover:text-[#0F1B3D] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`neu-focus flex h-11 min-w-[128px] items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition-all disabled:opacity-60 disabled:hover:translate-y-0 ${styles.button}`}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Working…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
