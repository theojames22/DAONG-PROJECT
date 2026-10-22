"use client";

import {
  useState,
  FormEvent,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import BrandLoader, { BrandLoaderBackdrop } from "@/components/BrandLoader";

/** One step of the login entrance cascade — see .login-item in globals.css. */
const step = (ms: number) => ({ "--login-delay": `${ms}ms` }) as CSSProperties;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held between "credentials accepted" and the dashboard actually loading,
  // so the redirect never shows a bare, unstyled gap.
  const [navigating, setNavigating] = useState(false);
  // Safety net: if the document navigation cannot complete, release the
  // bridge instead of leaving the user on an endless loader.
  const navTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const savedEmail = localStorage.getItem("remembered_email");
    const savedPassword = localStorage.getItem("remembered_password");
    if (savedEmail && savedPassword) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRemember(true);
    }
  }, []);

  useEffect(() => {
    const clearBridgeTimer = () => {
      if (navTimerRef.current !== undefined) {
        window.clearTimeout(navTimerRef.current);
        navTimerRef.current = undefined;
      }
    };
    // A restored back/forward page must never come back mid-bridge.
    const releaseBridge = () => {
      clearBridgeTimer();
      setNavigating(false);
      setIsSubmitting(false);
    };
    window.addEventListener("pagehide", clearBridgeTimer);
    window.addEventListener("pageshow", releaseBridge);
    return () => {
      clearBridgeTimer();
      window.removeEventListener("pagehide", clearBridgeTimer);
      window.removeEventListener("pageshow", releaseBridge);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      if (remember) {
        localStorage.setItem("remembered_email", email);
        localStorage.setItem("remembered_password", password);
      } else {
        localStorage.removeItem("remembered_email");
        localStorage.removeItem("remembered_password");
      }

      // Fetch role + position directly from the profile so we can
      // redirect without going through the server-rendered root
      // page (avoids cookie timing issues). Role decides the
      // dashboard: Head → /head, Staff → /employee.
      const userId = data.session?.user?.id;
      let destination = "/employee";

      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, position")
          .eq("id", userId)
          .single();

        if (profile?.role === "head" || profile?.position === "head") {
          destination = "/head";
        }
      }

      // Hand the transition over to the same branded loader the app opens
      // with. The dashboard document renders the identical overlay, so the
      // two sides join up with no unstyled gap in between.
      setNavigating(true);
      // Let the bridge paint before the document changes.
      navTimerRef.current = window.setTimeout(() => {
        navTimerRef.current = undefined;
        setNavigating(false);
        setIsSubmitting(false);
        setError(
          "We couldn't open your dashboard. Please check your connection and try again."
        );
      }, 8000);
      await new Promise((resolve) => window.setTimeout(resolve, 140));
      window.location.assign(destination);
    } catch (err: any) {
      if (navTimerRef.current !== undefined) {
        window.clearTimeout(navTimerRef.current);
        navTimerRef.current = undefined;
      }
      setNavigating(false);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Scoped overrides: restore original gold/warm neumorphic look for login only */}
      <style>{`
        .login-scope .neu-raised {
          background-color: #e6ebf2;
          box-shadow: 8px 8px 16px #b7c1d1, -8px -8px 16px #ffffff;
        }
        .login-scope .neu-pressed {
          background-color: #e6ebf2;
          box-shadow: inset 5px 5px 10px #b7c1d1, inset -5px -5px 10px #ffffff;
        }
        .login-scope .neu-button {
          background-color: #e6ebf2;
          box-shadow: 6px 6px 12px #b7c1d1, -6px -6px 12px #ffffff;
        }
        .login-scope .neu-icon-btn {
          background-color: #e6ebf2;
          box-shadow: 3px 3px 6px #b7c1d1, -3px -3px 6px #ffffff;
        }
        .login-scope .neu-focus:focus-visible {
          outline: 2px solid #b8862e;
          outline-offset: 3px;
          border-radius: 8px;
        }
        .login-scope .text-ink-muted { color: #71798A; }
        .login-scope .text-ink { color: #2B3542; }
        /* The busy background painting can swallow small caption text. */
        .login-scope .login-footnote {
          width: fit-content;
          margin-left: auto;
          margin-right: auto;
          padding: 6px 14px;
          border-radius: 999px;
          color: #59647a;
          background-color: rgba(255, 255, 255, 0.72);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
        }
        .login-scope .login-field {
          transition: box-shadow 180ms ease, background-color 180ms ease;
        }
        /* Warm gold focus glow, preserving the original neumorphic inset. */
        .login-scope .login-field:focus,
        .login-scope .login-field:focus-visible {
          background-color: #e9edf3;
          box-shadow:
            inset 4px 4px 8px #b7c1d1,
            inset -4px -4px 8px #ffffff,
            0 0 0 3px rgba(184, 134, 46, 0.16);
        }
      `}</style>
      <main className="login-scope relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="login-bg" aria-hidden="true" />
        <div className="login-enter relative z-10 w-full max-w-[400px]">
          <div className="neu-raised rounded-neu px-8 py-9 sm:px-10 sm:py-10">
            <div className="login-item" style={step(60)}>
              <Logo />
            </div>

            <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-5">
              <div className="login-item flex flex-col gap-2" style={step(120)}>
                <label
                  htmlFor="email"
                  className="text-[13px] font-medium text-ink-muted"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your Username"
                  className="login-field neu-pressed neu-focus rounded-2xl px-4 py-3 text-[14px] text-ink placeholder:text-ink-muted/60 outline-none"
                />
              </div>

              <div className="login-item flex flex-col gap-2" style={step(180)}>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-[13px] font-medium text-ink-muted"
                  >
                    Password
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-[12.5px] font-medium hover:underline"
                    style={{ color: "#8F6820" }}
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="login-field neu-pressed neu-focus w-full rounded-2xl px-4 py-3 pr-12 text-[14px] text-ink placeholder:text-ink-muted/60 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="neu-icon-btn neu-focus absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="login-error-in text-[13px] text-red-600"
                >
                  {error}
                </p>
              )}

              <label
                className="login-item flex select-none items-center gap-2.5 pt-1"
                style={step(260)}
              >
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="neu-pressed peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#b8862e] h-5 w-5 rounded-md" />
                  {remember && (
                    <svg
                      className="pointer-events-none absolute h-3 w-3"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2 6L4.5 8.5L10 3"
                        stroke="#B8862E"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-[13px] text-ink-muted">
                  Keep me signed in
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="login-item neu-button neu-focus mt-2 w-full rounded-2xl py-3.5 text-[14.5px] font-semibold disabled:opacity-60"
                style={{ ...step(320), color: "#8F6820" }}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p
            className="login-item login-footnote mt-6 text-center text-[13px] text-ink-muted"
            style={step(380)}
          >
            Need access? Contact your administrator.
          </p>
        </div>
      </main>

      {/* Post-login bridge: the same loader the app opens with, so signing in
          and arriving at the dashboard read as one continuous transition
          instead of a bare reload. */}
      {navigating && (
        <div
          className="loading-overlay is-loader"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <BrandLoaderBackdrop variant="loader" />
          {/* No measurable progress here, so the bar stays indeterminate
              rather than pretending to know a percentage. */}
          <BrandLoader variant="loader" label="Signing you in…" />
        </div>
      )}
    </>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 1.5L14.5 14.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M6.5 3.3C7 3.1 7.5 3 8 3C12.5 3 15 8 15 8C14.6 8.7 14 9.6 13.2 10.4M4.2 4.7C2.4 5.9 1 8 1 8C1 8 3.5 13 8 13C9 13 9.9 12.7 10.6 12.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M6.6 9.4C6.2 9 6 8.5 6 8C6 6.9 6.9 6 8 6C8.5 6 9 6.2 9.4 6.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
