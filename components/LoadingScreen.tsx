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
   A time-based ease-out ramp carries the bar towards 90%. The final 10%
   waits for the page to genuinely finish loading (window `load` event /
   webfonts), so the bar never fake-finishes. A hard cap guarantees it can
   never get stuck, and reduced-motion users skip straight to the content.

   Variants
   `intro`  — the cinematic opening. Plays once per browser session, and
              only when the app is about to reveal the login page.
   `loader` — the premium progress loader for every other full page load
              (a refresh, or the post-login redirect into a dashboard).

   The overlay is mounted once in the root layout, so client-side
   navigations never show it again. */

const RAMP_MS = 1200;
const HOLD_MS = 260;
const FADE_MS = 420; // keep in sync with .loading-overlay's opacity transition
const MAX_MS = 5000;

// The opening is a timed cinematic: it never shows for less than INTRO_MIN_MS
// and never stretches past INTRO_MAX_MS, so it always lands in the intended
// two-to-three second window even on a slow connection.
const INTRO_MIN_MS = 2300;
const INTRO_HOLD_MS = 300;
const INTRO_MAX_MS = 3100;

const INTRO_SESSION_KEY = "daong:intro-played";

type Variant = "intro" | "loader";

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

// useLayoutEffect warns during SSR; the decision has to run before the
// first paint on the client, so use the isomorphic form.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function LoadingScreen() {
  const pathname = usePathname();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [phase, setPhase] = useState<"loading" | "exiting" | "done">("loading");

  const fillRef = useRef<HTMLDivElement>(null);
  /** The variant is decided exactly once, so a dev-mode double effect can
   *  never flip the overlay (or replay the intro) mid-flight. */
  const decisionRef = useRef<Variant | null>(null);
  /** Lets the skip button reach into the running effect. */
  const skipRef = useRef<() => void>(() => {});

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;

    // Reduced motion: never make anyone sit through the opening or the ramp.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    let holdTimer: number | undefined;
    let exitTimer: number | undefined;
    let finished = false;

    // Flip the entrance trigger in the same frame the overlay starts
    // fading, so the page's own entrance and the fade read as one
    // continuous motion instead of two separate steps.
    const finish = () => {
      if (finished) return;
      finished = true;
      root.dataset.appReady = "true";
      document.body.classList.remove("overflow-hidden");
      setPhase("exiting");
      exitTimer = window.setTimeout(() => setPhase("done"), FADE_MS);
    };
    skipRef.current = finish;

    // The document is genuinely ready once the load event has fired and the
    // webfonts have settled. Neither blocks the reveal past the hard cap.
    let loaded = document.readyState === "complete";
    const markLoaded = () => {
      loaded = true;
    };
    window.addEventListener("load", markLoaded);
    document.fonts?.ready.then(markLoaded, markLoaded);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        finish();
      }
    };
    // Any deliberate click or tap means "get on with it".
    const onPointerDown = () => finish();

    const startedAt = performance.now();

    if (active === "intro") {
      window.addEventListener("keydown", onKeyDown);
      document.addEventListener("pointerdown", onPointerDown, {
        capture: true,
        passive: true,
      });

      // Never cut the opening short just because the document happened to be
      // ready early, and never hold it past INTRO_MAX_MS even if it wasn't.
      const tickIntro = (now: number) => {
        const elapsed = now - startedAt;
        if ((elapsed >= INTRO_MIN_MS && loaded) || elapsed >= INTRO_MAX_MS) {
          holdTimer = window.setTimeout(finish, INTRO_HOLD_MS);
          return;
        }
        frame = requestAnimationFrame(tickIntro);
      };
      frame = requestAnimationFrame(tickIntro);
    } else {
      // Read the node on every frame: the ref is only attached once the
      // variant markup has committed, which happens after this effect.
      const setProgress = (value: number) => {
        const fill = fillRef.current;
        if (fill) fill.style.width = `${value * 100}%`;
      };
      setProgress(0);

      let progress = 0;
      let fullAt = 0;

      const tick = (now: number) => {
        const elapsed = now - startedAt;
        if (elapsed > MAX_MS) loaded = true;

        const ramp = 1 - Math.pow(1 - Math.min(elapsed / RAMP_MS, 1), 3); // easeOutCubic
        const target = loaded ? 1 : ramp * 0.9;
        progress += (target - progress) * (loaded ? 0.16 : 0.09);
        if (loaded && progress > 0.995) progress = 1;

        setProgress(progress);

        if (progress >= 1) {
          if (!fullAt) fullAt = now;
          if (now - fullAt >= HOLD_MS) {
            finish();
            return; // reveal() schedules the unmount
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(holdTimer);
      window.clearTimeout(exitTimer);
      window.removeEventListener("load", markLoaded);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
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
      className={`loading-overlay${phase === "exiting" ? " is-exiting" : ""}`}
      role="status"
      aria-busy={phase === "loading"}
      aria-live="polite"
    >
      <BrandLoaderBackdrop />

      {/* Rendered only once the variant is known, so the first paint is the
          clean backdrop and neither variant ever flashes the other one. */}
      {variant && (
        <BrandLoader
          variant={variant}
          fillRef={fillRef}
        />
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
