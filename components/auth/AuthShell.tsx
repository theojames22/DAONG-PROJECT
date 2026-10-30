import type { ReactNode } from "react";
import styles from "./auth.module.css";

/**
 * Shared shell for the password-recovery screens.
 *
 * It reuses the login page's background implementation verbatim — the global
 * `.login-bg` class (same asset, `cover`, `center`, fixed to the viewport) and
 * the `login-scope` wrapper that keeps the scrollbar behaviour identical. The
 * artwork is never replaced, resized or duplicated.
 */
export default function AuthShell({
  children,
  labelledBy,
}: {
  children: ReactNode;
  /** id of the heading that names this screen for assistive tech. */
  labelledBy?: string;
}) {
  return (
    <main
      className="login-scope relative flex min-h-[100svh] flex-col items-center justify-center overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12"
      aria-labelledby={labelledBy}
    >
      <div className="login-bg" aria-hidden="true" />

      <div className={`relative z-10 w-full max-w-[420px] ${styles.enter}`}>
        <div className="rounded-[22px] border border-slate-200/70 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
