"use client";

import type { RefObject } from "react";

/* The shared Daong loading visual.
   ---------------------------------------------------------------------
   `LoadingScreen` renders the full-screen overlay, and the login page
   renders the same thing as its post-submit bridge, so opening the site
   and signing in read as one continuous experience instead of two
   unrelated spinners. Styling lives in app/globals.css. */

export type BrandLoaderVariant = "intro" | "loader";

/** The atmospheric layers behind the mark. */
export function BrandLoaderBackdrop() {
  return (
    <div className="loading-backdrop" aria-hidden="true">
      <span className="loading-aurora loading-aurora-1">
        <span />
      </span>
      <span className="loading-aurora loading-aurora-2">
        <span />
      </span>
      <span className="loading-waves" />
    </div>
  );
}

export interface BrandLoaderProps {
  variant: BrandLoaderVariant;
  /** Filled by the controller with the *real* progress width. */
  fillRef?: RefObject<HTMLDivElement>;
  /** Real progress is not measurable — sweep the bar rather than faking it. */
  indeterminate?: boolean;
  label?: string;
}

export default function BrandLoader({
  variant,
  fillRef,
  indeterminate = false,
  label = "Preparing your workspace…",
}: BrandLoaderProps) {
  const isIntro = variant === "intro";

  return (
    <div className={`loading-stage is-${variant}`}>
      <div className="loading-mark">
        <span className="loading-halo" aria-hidden="true" />
        <span className="loading-frame">
          {/* Decorative: the status text below carries the meaning. */}
          <img src="/images/logo.png" alt="" />
          {/* The light sweep belongs to the opening; the loader stays calm. */}
          {isIntro && <span className="loading-sweep" aria-hidden="true" />}
        </span>
      </div>

      {isIntro ? (
        <p className="loading-tagline">
          Ang Bawat Oras sa Paglalayag ng The FISHERMAN Group of Publications
        </p>
      ) : (
        <div className="loading-progress">
          <div
            className={`loading-track${indeterminate ? " is-indeterminate" : ""}`}
          >
            <div ref={fillRef} className="loading-fill" />
          </div>
          <p className="loading-label">{label}</p>
        </div>
      )}
    </div>
  );
}
