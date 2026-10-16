"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Pencil, Trash2 } from "lucide-react";
import type { EquipmentUsage } from "@/lib/types";
import styles from "./usageActions.module.css";

export interface UsageRowActionsProps {
  entry: EquipmentUsage;
  /** The page keeps a single open menu, so this row owns the open flag. */
  open: boolean;
  /** Name used for accessible labels, e.g. the equipment name. */
  label: string;
  onToggle: (id: string) => void;
  onClose: () => void;
  onEdit: (entry: EquipmentUsage, opener: HTMLButtonElement | null) => void;
  onCancel: (entry: EquipmentUsage) => void;
  onDelete: (entry: EquipmentUsage) => void;
}

/** Distance from the toggle to each bubble's centre. */
const DISTANCE = 62;
/** Keep the whole fan inside the viewport edges. */
const EDGE_MARGIN = 88;
/** How long the exit animation runs before the portal unmounts. */
const EXIT_MS = 220;

// Three bubbles spread across a half-circle centred on the vertical.
// Above the toggle they fan up/left/right; below they mirror.
const ANGLES_ABOVE = [-150, -90, -30];
const ANGLES_BELOW = [150, 90, 30];

type Origin = { x: number; y: number; above: boolean };

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Circular hamburger toggle + radial Edit / Cancel / Delete menu.
 *
 * The menu is portalled to <body> and positioned with fixed viewport
 * coordinates, so it is never clipped by the card or the table's
 * horizontal-scroll wrapper and never adds width or height to the row.
 * It closes on selection, outside click, Escape, scroll or resize.
 */
export default function UsageRowActions({
  entry,
  open,
  label,
  onToggle,
  onClose,
  onEdit,
  onCancel,
  onDelete,
}: UsageRowActionsProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [mounted, setMounted] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [shown, setShown] = useState(false);

  const isCancelled = Boolean(entry.cancelled_at);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Measure the toggle and place the fan (above when there's room,
  // otherwise below) whenever the menu opens.
  useEffect(() => {
    if (open) {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const above = rect.top >= 132;
      setOrigin({
        x: clamp(
          rect.left + rect.width / 2,
          EDGE_MARGIN,
          Math.max(EDGE_MARGIN, window.innerWidth - EDGE_MARGIN)
        ),
        y: rect.top + rect.height / 2,
        above,
      });
      return;
    }
    // Closing: reverse the animation, then remove the portal.
    setShown(false);
    const timer = window.setTimeout(() => setOrigin(null), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Animate in only after the collapsed bubbles have painted, so the
  // transition actually runs instead of mounting already expanded.
  useEffect(() => {
    if (!open || !origin) return;
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open, origin]);

  // Move focus to the first available action once the menu is up.
  useEffect(() => {
    if (!open || !shown) return;
    const first = layerRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not([disabled])'
    );
    first?.focus();
  }, [open, shown]);

  // Dismiss on outside press, Escape, scroll or resize.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (layerRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      buttonRef.current?.focus();
    };
    const onScroll = () => onClose();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose]);

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not([disabled])'
        )
      );
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        items[(index + 1 + items.length) % items.length]?.focus();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    },
    []
  );

  const actions = [
    {
      key: "edit",
      label: "Edit entry",
      title: "Edit",
      className: styles.edit,
      disabled: false,
      icon: <Pencil className="h-4 w-4" />,
      run: () => onEdit(entry, buttonRef.current),
    },
    {
      key: "cancel",
      label: isCancelled ? "Already cancelled" : "Cancel booking",
      title: isCancelled ? "Already cancelled" : "Cancel booking",
      className: styles.cancel,
      disabled: isCancelled,
      icon: <Ban className="h-4 w-4" />,
      run: () => onCancel(entry),
    },
    {
      key: "delete",
      label: "Delete entry",
      title: "Delete",
      className: styles.delete,
      disabled: false,
      icon: <Trash2 className="h-4 w-4" />,
      run: () => onDelete(entry),
    },
  ];

  return (
    <span className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(entry.id);
        }}
        aria-label={
          open
            ? `Close actions menu for ${label}`
            : `Open actions menu for ${label}`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={origin ? menuId : undefined}
        title="Actions"
        data-open={open}
        className={`neu-focus ${styles.toggle}`}
      >
        <span className={styles.bars} aria-hidden="true">
          <span className={`${styles.bar} ${styles.bar1}`} />
          <span className={`${styles.bar} ${styles.bar2}`} />
          <span className={`${styles.bar} ${styles.bar3}`} />
        </span>
      </button>

      {mounted &&
        origin &&
        createPortal(
          <div
            ref={layerRef}
            id={menuId}
            role="menu"
            aria-label={`Actions for ${label}`}
            className={styles.layer}
            onKeyDown={handleMenuKeyDown}
          >
            {actions.map((action, index) => {
              const angle = (origin.above ? ANGLES_ABOVE : ANGLES_BELOW)[index];
              const radians = (angle * Math.PI) / 180;
              const dx = Math.cos(radians) * DISTANCE;
              const dy = Math.sin(radians) * DISTANCE;
              return (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  aria-label={action.label}
                  title={action.title}
                  disabled={action.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (action.disabled) return;
                    action.run();
                    onClose();
                  }}
                  className={`neu-focus ${styles.item} ${action.className} ${
                    shown ? styles.itemOpen : ""
                  }`}
                  style={
                    {
                      left: origin.x,
                      top: origin.y,
                      "--tx": `${dx}px`,
                      "--ty": `${dy}px`,
                      transitionDelay: shown ? `${index * 45}ms` : "0ms",
                    } as React.CSSProperties
                  }
                >
                  {action.icon}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </span>
  );
}
