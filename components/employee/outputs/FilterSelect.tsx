"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** Accessible name — the visible label is the current value. */
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** Applies to the wrapper (the flex/grid item), so widths stay predictable. */
  className?: string;
}

/**
 * A small, page-scoped listbox.
 *
 * A native <select> cannot be styled or animated, so this keeps the design
 * language (soft border, blue focus glow, fade-in menu) while staying
 * keyboard-complete: Arrow Up/Down, Home/End, Enter/Space, Escape, Tab, and
 * focus returns to the trigger on close.
 */
export default function FilterSelect({
  label,
  value,
  options,
  onChange,
  className = "",
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selectedLabel = options[selectedIndex]?.label ?? label;

  // Close on an outside press.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Move real DOM focus onto the active option so screen readers announce it.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function closeMenu(returnFocus = false) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    closeMenu(true);
  }

  function handleOptionKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex(Math.min(options.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex(Math.max(0, index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // Let focus continue to the next control; just retire the menu.
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`relative min-w-0 ${className}`}
      onBlur={(event) => {
        if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openMenu();
          }
        }}
        className={styles.selectTrigger}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          style={{ color: "var(--mo-muted)" }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className={`${styles.selectMenu} animate-dropdown-in`}>
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-60 overflow-y-auto overscroll-contain"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <li key={option.value} role="none">
                  <button
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onClick={() => choose(index)}
                    onKeyDown={(event) => handleOptionKey(event, index)}
                    className={`${styles.selectOption} ${
                      selected ? styles.selectOptionOn : ""
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
