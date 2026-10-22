"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";

/**
 * Export menu — one button, two options (CSV / Excel). Both hit
 * /api/reports/export with the SAME filters the table is showing, so
 * the file always contains exactly the visible rows.
 *
 * The menu is rendered in a portal with fixed positioning so it can
 * never be clipped by the filter card or trapped behind the cards
 * that follow it (an ancestor with a transform creates a stacking
 * context, which is exactly what an absolutely-positioned child would
 * be stuck inside).
 *
 * The links carry `download`, and the API sends
 * Content-Disposition: attachment with the correct file name.
 */

export interface ExportMenuProps {
  buildExportUrl: (format: "csv" | "xls") => string;
  disabled?: boolean;
}

const MENU_WIDTH = 208; // w-52
const GAP = 8;
const VIEWPORT_MARGIN = 12;

export default function ExportMenu({ buildExportUrl, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Place the menu directly below its button, left edges aligned, and
  // clamp it inside the viewport.
  const reposition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const top = rect.bottom + GAP;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)
    );
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;

    reposition();

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        !(target instanceof Element && target.closest("[data-export-menu]"))
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    // Keep the menu attached to the button while the page scrolls.
    function handleScroll() {
      reposition();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleScroll);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, reposition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) reposition();
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[#D5E0F5] bg-white px-5 text-[13px] font-bold text-[#0F1B33] shadow-sm transition-all hover:border-[#2563EB] hover:text-[#2563EB] focus:outline-none focus:ring-4 focus:ring-[#E1EBFF] disabled:opacity-60 sm:w-auto"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            data-export-menu
            role="menu"
            aria-label="Export report"
            className="fixed z-[120] w-52 animate-dropdown-in overflow-hidden rounded-2xl border border-[#D5E0F5] bg-white p-1.5 shadow-[0_10px_30px_rgba(15,27,61,0.12)]"
            style={{ top: position.top, left: position.left }}
          >
            <a
              role="menuitem"
              href={buildExportUrl("csv")}
              download
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#0F1B33] transition-colors hover:bg-[#F1F6FF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <FileText className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
              CSV (.csv)
            </a>
            <a
              role="menuitem"
              href={buildExportUrl("xls")}
              download
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#0F1B33] transition-colors hover:bg-[#F1F6FF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#0F6A3C]" aria-hidden="true" />
              Excel (.xls)
            </a>
          </div>,
          document.body
        )}
    </>
  );
}
