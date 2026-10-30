"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  Loader2,
  MailCheck,
  Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import AuthShell from "@/components/auth/AuthShell";
import styles from "@/components/auth/auth.module.css";
import {
  RESET_COOLDOWN_MS,
  authErrorStatus,
  isValidEmail,
  normalizeEmail,
  resetRequestMessage,
} from "@/lib/auth/reset";

type Step = "form" | "sent";

const FIELD_BASE =
  "h-12 w-full rounded-xl border bg-white px-4 text-[16px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 sm:text-[14.5px]";
const FIELD_IDLE =
  "border-slate-200 focus:border-[#2563EB] focus:ring-4 focus:ring-blue-500/15";
const FIELD_INVALID =
  "border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-500/15";

const PRIMARY_BUTTON =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[14.5px] font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 active:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-60";

const SECONDARY_BUTTON =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[14.5px] font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:text-[#2563EB] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60";

const LINK =
  "rounded-sm font-semibold text-[#2563EB] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className={`${styles.feedback} flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium leading-snug text-rose-700`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  /** Sends one recovery request. Throws the provider error for the caller to map. */
  const requestReset = useCallback(async (address: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      // Origin-relative: works in local dev, previews and production without
      // depending on a possibly stale NEXT_PUBLIC_SITE_URL. Supabase validates
      // it against the project's redirect allow-list either way.
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) throw error;
  }, []);

  // Countdown for the resend control. Timestamp-based, so a background tab
  // that throttles the interval still shows the correct remaining time.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setCooldownLeft(0);
      return;
    }

    setCooldownLeft(Math.ceil((cooldownUntil - Date.now()) / 1000));
    let timer: number | undefined;

    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left === 0 && timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    timer = window.setInterval(tick, 1000);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [cooldownUntil]);

  // Move focus to the confirmation heading so screen-reader users hear the
  // outcome without having to hunt for it.
  useEffect(() => {
    if (step === "sent") sentHeadingRef.current?.focus();
  }, [step]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const address = normalizeEmail(email);
    setRequestError(null);
    setResendNotice(null);

    if (!address) {
      setFieldError("Enter the email address for your account.");
      emailRef.current?.focus();
      return;
    }

    if (!isValidEmail(address)) {
      setFieldError("Enter a valid email address, like you@example.com.");
      emailRef.current?.focus();
      return;
    }

    setFieldError(null);
    setIsSubmitting(true);

    try {
      await requestReset(address);
      setEmail(address);
      setSentTo(address);
      setCooldownUntil(Date.now() + RESET_COOLDOWN_MS);
      setStep("sent");
    } catch (error) {
      // Keep the address so the user can correct it without retyping.
      setRequestError(resetRequestMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (isSubmitting || cooldownLeft > 0) return;

    setRequestError(null);
    setResendNotice(null);
    setIsSubmitting(true);

    try {
      await requestReset(sentTo);
      setCooldownUntil(Date.now() + RESET_COOLDOWN_MS);
      setResendNotice("A new reset link has been requested.");
    } catch (error) {
      setRequestError(resetRequestMessage(error));
      if (authErrorStatus(error) === 429) {
        setCooldownUntil(Date.now() + RESET_COOLDOWN_MS);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleChangeEmail() {
    setStep("form");
    setFieldError(null);
    setRequestError(null);
    setResendNotice(null);
    window.requestAnimationFrame(() => {
      emailRef.current?.focus();
      emailRef.current?.select();
    });
  }

  if (step === "sent") {
    return (
      <AuthShell labelledBy="reset-sent-title">
        <div className={styles.panel}>
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB] ring-1 ring-blue-100">
              <MailCheck
                className="h-7 w-7"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
          </div>

          <h1
            id="reset-sent-title"
            ref={sentHeadingRef}
            tabIndex={-1}
            className="mt-5 text-center text-[26px] font-bold leading-tight tracking-tight text-[#0F172A] outline-none sm:text-[28px]"
          >
            Check your email
          </h1>

          <p className="mt-2.5 text-center text-[14px] leading-relaxed text-slate-500">
            If an account exists for{" "}
            <span className="font-semibold text-slate-700">{sentTo}</span>,
            you&rsquo;ll receive instructions to reset your password. Check your
            inbox and spam folder.
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            {requestError && <ErrorBox message={requestError} />}

            {resendNotice && (
              <p
                role="status"
                aria-live="polite"
                className="text-center text-[12.5px] font-medium text-emerald-700"
              >
                {resendNotice}
              </p>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={isSubmitting || cooldownLeft > 0}
              aria-busy={isSubmitting}
              className={PRIMARY_BUTTON}
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Sending reset link…
                </>
              ) : cooldownLeft > 0 ? (
                `Resend in ${cooldownLeft}s`
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Resend reset link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleChangeEmail}
              disabled={isSubmitting}
              className={SECONDARY_BUTTON}
            >
              Use a different email
            </button>
          </div>

          <p className="mt-6 border-t border-slate-100 pt-5 text-center text-[13px] text-slate-500">
            <Link href="/login" className={LINK}>
              Back to login
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell labelledBy="forgot-title">
      <div className={styles.panel}>
        <div className="flex justify-center">
          <Logo />
        </div>

        <h1
          id="forgot-title"
          className="mt-6 text-[26px] font-bold leading-tight tracking-tight text-[#0F172A] sm:text-[28px]"
        >
          Forgot your password?
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
          Enter the email address associated with your account. If an account
          exists, we&rsquo;ll send you instructions to reset your password.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="reset-email"
              className="text-[13px] font-semibold text-slate-700"
            >
              Email address
            </label>
            <input
              ref={emailRef}
              id="reset-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (fieldError) setFieldError(null);
                if (requestError) setRequestError(null);
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "reset-email-error" : undefined}
              className={`${FIELD_BASE} ${fieldError ? FIELD_INVALID : FIELD_IDLE}`}
            />
            <p
              id="reset-email-error"
              aria-live="polite"
              className={`min-h-[18px] text-[12.5px] font-medium ${
                fieldError ? "text-rose-600" : "text-transparent"
              }`}
            >
              {fieldError ?? "\u00A0"}
            </p>
          </div>

          {requestError && <ErrorBox message={requestError} />}

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className={`${PRIMARY_BUTTON} mt-1`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending reset link…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </form>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t border-slate-100 pt-5 text-center text-[13px] text-slate-500">
          Remembered your password?{" "}
          <Link href="/login" className={LINK}>
            Back to login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
