"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff, X } from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import { useBodyScrollLock } from "@/components/shared/ModalShell";
import { useFocusTrap } from "./use-focus-trap";

export interface LightboxImage {
  url: string;
  name: string;
}

/**
 * Full-screen preview for a submitted image.
 *
 * Rendered in a portal above the details drawer. Escape and the backdrop close
 * it, focus is trapped and restored, and body scroll is locked. The capture-
 * phase Escape handler stops the event before the drawer's own listener sees
 * it, so one Escape never closes both layers.
 */
export default function ImageLightbox({
  image,
  onClose,
  lockScroll = true,
}: {
  image: LightboxImage | null;
  onClose: () => void;
  /** The drawer already locks scroll; keep this configurable for safety. */
  lockScroll?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setFailed(false);
  }, [image?.url]);

  useBodyScrollLock(Boolean(image) && lockScroll);
  useFocusTrap(dialogRef, Boolean(image));

  useEffect(() => {
    if (!image) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [image, onClose]);

  if (!mounted || !image) return null;

  return createPortal(
    <div
      className={`${styles.scope} ${styles.lightboxRoot}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Image preview: ${image.name}`}
        className="relative flex max-h-full max-w-full flex-col items-center justify-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image preview"
          className={styles.lightboxClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        {failed ? (
          <div
            className="flex max-w-md flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center text-white"
            style={{ background: "rgba(15, 27, 51, 0.82)" }}
          >
            <ImageOff className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm font-bold">This image could not be displayed</p>
            <p className="text-[13px] font-medium leading-relaxed text-white/70">
              It may no longer exist in storage. The submission record itself is
              still available in the details panel.
            </p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.name}
            onError={() => setFailed(true)}
            className={styles.lightboxImage}
          />
        )}

        <p className={styles.lightboxCaption}>{image.name}</p>
      </div>
    </div>,
    document.body
  );
}
