"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Opt-in focus trap for a dialog/drawer.
 *
 * - moves focus to the first control inside `ref` when it becomes active
 * - keeps Tab / Shift+Tab cycling inside it
 * - restores focus to whatever was focused before on unmount
 *
 * Nothing is changed for the rest of the app: the hook only runs where it is
 * used, and only while `active` is true.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const node = ref.current;
    if (!node) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function focusable(): HTMLElement[] {
      return Array.from(node!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.getClientRects().length > 0
      );
    }

    const frame = requestAnimationFrame(() => {
      const list = focusable();
      if (list.length > 0) list[0].focus();
      else {
        node!.tabIndex = -1;
        node!.focus();
      }
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;

      const list = focusable();
      if (list.length === 0) {
        event.preventDefault();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!current || current === first || !node!.contains(current)) {
          event.preventDefault();
          last.focus();
        }
      } else if (!current || current === last || !node!.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    }

    // Capture phase so it still runs if a child stops propagation.
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [ref, active]);
}
