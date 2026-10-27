"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  ariaLabelledBy?: string;
  className?: string;
  /** Optional replacement for the default dimmed/blurred backdrop classes. */
  backdropClassName?: string;
  closeOnBackdropClick?: boolean;
}

/**
 * Locks document.body scroll while a modal is open and restores
 * the previous scroll behavior when the modal closes.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [locked]);
}

/**
 * Standardized modal shell ensuring consistent viewport centering,
 * dimmed backdrop with smooth blur, body scroll locking,
 * and responsive maximum heights across the entire project.
 * Uses createPortal to mount directly on document.body so parent transforms
 * or nested layouts never distort modal position or viewport containment.
 */
export default function ModalShell({
  open,
  onClose,
  children,
  maxWidthClass = "max-w-lg",
  ariaLabelledBy,
  className = "",
  backdropClassName,
  closeOnBackdropClick = true,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(open);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
      {/* Dimmed & Blurred Backdrop matching reference screenshot */}
      <div
        className={`fixed inset-0 animate-backdrop-in ${
          backdropClassName ?? "bg-slate-900/40 backdrop-blur-sm"
        }`}
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        className={`relative z-10 flex w-full flex-col rounded-3xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden animate-modal-in max-h-[calc(100vh-32px)] max-h-[calc(100dvh-32px)] sm:max-h-[calc(100dvh-48px)] dark:bg-slate-800 dark:border-slate-700/80 ${maxWidthClass} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
