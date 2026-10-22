"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import BrandLoader, { BrandLoaderBackdrop } from "@/components/BrandLoader";

/* Opening animation + loading screen
   ---------------------------------------------------------------------
   Progress model
   The app cannot honestly measure server rendering, auth hydration and
   asset readiness as a percentage, so the loader is indeterminate. It
   never fabricates a value. A hard cap guarantees it can never get
   stuck, and reduced-motion users skip straight to the content.

   Variants
   `intro`  — the cinematic opening. Plays once per browser session, and
              only when the app is about to reveal the login page.
   `loader` — the premium loader for every other full page load
              (a refresh, or the post-login redirect into a dashboard).

   The overlay is mounted once in the root layout, so client-side
   navigations never show it again. */

const LOADER_MIN_MS = 800;
const LOADER_MAX_MS = 6000;

// The opening is a timed cinematic: it never shows for less than INTRO_MIN_MS
// and never stretches past INTRO_MAX_MS, so it always lands in the intended
// two-to-three second window even on a slow connection.
const INTRO_MIN_MS = 2200;
const INTRO_MAX_MS = 2800;

// Keep in sync with .loading-overlay's opacity transition in globals.css.
const EXIT_MS = 780;

const INTRO_SESSION_KEY = "daong:intro-played";

type Variant = "intro" | "loader";
type Phase = "loading" | "exiting" | "done";

/* Session storage can throw (private mode, blocked cookies). Failing closed
   is the safe default: the app must never get stuck behind the overlay. */
function hasPlayedIntro() {
  try {
    return window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

function rememberIntro() {
  try {
    window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    /* nothing to remember — the intro simply plays again next time */
  }
}

/** Resolve when the mark is decoded, or on error. Never rejects. */
function waitForMark(src: string) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const image = new Image();
    image.onload = finish;
    image.onerror = finish;
    image.src = src;
    if (image.complete) finish();
    if (typeof image.decode === "function") {
      image.decode().then(finish, finish);
    }
  });
}

/** Resolve when webfonts settle, or immediately where unsupported. */
function waitForFonts() {
  if (typeof document === "undefined" || !document.fonts?.ready) {
    return Promise.resolve();
  }
  return document.fonts.ready.then(
    () => undefined,
    () => undefined
  );
}

/** The overlay's CSS choreography starts at first paint, which can happen
 *  before hydration. Measure from there so a slow JS load can never stretch
 *  the opening far beyond its two-to-three second budget. */
function getFirstPaintTime() {
  try {
    const entries = performance.getEntriesByType("paint");
    const first =
      entries.find((entry) => entry.name === "first-contentful-paint") ??
      entries[0];
    return first ? first.startTime : performance.now();
  } catch {
    return performance.now();
  }
}

// useLayoutEffect warns during SSR; the decision has to run before the
// first paint on the client, so use the isomorphic form.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function LoadingScreen() {
  const pathname = usePathname();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  /** The variant is decided exactly once, so a dev-mode double effect can
   *  never flip the overlay (or replay the intro) mid-flight. */
  const decisionRef = useRef<Variant | null>(null);
  /** Lets the skip button reach into the running effect. */
  const skipRef = useRef<() => void>(() => {});

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;

    // Reduced motion: never make anyone sit through the opening or the ramp.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      root.dataset.appReady = "true";
      setPhase("done");
      return;
    }

    if (decisionRef.current === null) {
      const next: Variant =
        pathname === "/login" && !hasPlayedIntro() ? "intro" : "loader";
      if (next === "intro") rememberIntro();
      decisionRef.current = next;
    }
    const active = decisionRef.current;

    setVariant(active);
    document.body.classList.add("overflow-hidden");

    let frame = 0;
    let exitTimer: number | undefined;
    let loadListener: (() => void) | undefined;
    let cancelled = false;
    let finished = false;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        finish();
      }
    };
    // Any deliberate click or tap means "get on with it".
    const onPointerDown = () => finish();

    const removeInteraction = () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (loadListener) {
        window.removeEventListener("load", loadListener);
        loadListener = undefined;
      }
    };

    // Flip the entrance trigger in the same frame the overlay starts
    // fading, so the page's own entrance and the fade read as one
    // continuous motion instead of two separate steps.
    const finish = () => {
      if (finished) return;
      finished = true;

      cancelAnimationFrame(frame);
      window.clearTimeout(exitTimer);
      removeInteraction();

      root.dataset.appReady = "true";
      document.body.classList.remove("overflow-hidden");
      setPhase("exiting");
      exitTimer = window.setTimeout(() => {
        if (!cancelled) setPhase("done");
      }, EXIT_MS);
    };
    skipRef.current = finish;

    // Readiness is real: the document's load event, the webfonts, and the
    // brand mark's decode. The intro's minimum still applies so the
    // choreography can finish; every path is capped so nothing traps.
    const signals: Array<Promise<unknown>> = [
      waitForMark("/images/logo.png"),
      waitForFonts(),
    ];

    if (document.readyState === "complete") {
      signals.push(Promise.resolve());
    } else {
      signals.push(
        new Promise<void>((resolve) => {
          loadListener = () => {
            loadListener = undefined;
            resolve();
          };
          window.addEventListener("load", loadListener, { once: true });
        })
      );
    }

    let ready = false;
    Promise.all(signals).then(
      () => {
        ready = true;
      },
      () => {
        ready = true;
      }
    );

    const startedAt = getFirstPaintTime();
    const minMs = active === "intro" ? INTRO_MIN_MS : LOADER_MIN_MS;
    const maxMs = active === "intro" ? INTRO_MAX_MS : LOADER_MAX_MS;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed >= maxMs || (elapsed >= minMs && ready)) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    if (active === "intro") {
      window.addEventListener("keydown", onKeyDown);
      document.addEventListener("pointerdown", onPointerDown, {
        capture: true,
        passive: true,
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(exitTimer);
      removeInteraction();
      document.body.classList.remove("overflow-hidden");
    };
    // Decided once, on mount: the overlay only ever lives on a full page
    // load, and internal navigations must not bring it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "done") return null;

  const isIntro = variant === "intro";

  return (
    <div
      className={`loading-overlay${variant ? ` is-${variant}` : ""}${
        phase === "exiting" ? " is-exiting" : ""
      }`}
      role="status"
      aria-busy={phase === "loading"}
      aria-live="polite"
    >
      <BrandLoaderBackdrop variant={variant} />

      {/* Rendered only once the variant is known, so the first paint is the
          clean backdrop and neither variant ever flashes the other one. */}
      {variant && (
        <BrandLoader variant={variant} label="Preparing your workspace…" />
      )}

      {/* The opening is short, but nobody is trapped in it. */}
      {isIntro && (
        <button
          type="button"
          className="loading-skip"
          onClick={() => skipRef.current()}
        >
          Skip intro
        </button>
      )}

      <span className="sr-only">
        {isIntro ? "Opening Daong" : "Loading Daong"}
      </span>
    </div>
  );
}
