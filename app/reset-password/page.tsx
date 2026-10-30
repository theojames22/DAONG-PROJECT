"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import AuthShell from "@/components/auth/AuthShell";
import styles from "@/components/auth/auth.module.css";
import {
  PASSWORD_POLICY_HINT,
  isMissingSessionError,
  passwordUpdateMessage,
  validateNewPassword,
} from "@/lib/auth/reset";

type Phase = "checking" | "form" | "invalid" | "success";

const FIELD_BASE =
  "h-12 w-full rounded-xl border bg-white px-4 pr-12 text-[16px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 sm:text-[14.5px]";
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

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startedRef = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const invalidHeadingRef = useRef<HTMLHeadingElement>(null);

  // Establish the recovery context once. The callback has already exchanged
  // the one-time code server-side; this only reads the resulting session (or
  // handles the case where the callback bounced back with an error).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const providerError = params.get("error") ?? hashParams.get("error");
    const code = params.get("code");

    // Never leave recovery details (code, error_description) in the address
    // bar. A reload after this point must not retry a consumed link.
    if (
      providerError ||
      code ||
      params.has("error_code") ||
      params.has("error_description") ||
      hashParams.has("error_code") ||
      hashParams.has("error_description")
    ) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (providerError) {
      setPhase("invalid");
      return;
    }

    const establish = async () => {
      const supabase = createClient();

      // Some Supabase configurations point the recovery redirect straight at
      // this page instead of /auth/callback. Support the code exchange here
      // too, so either configuration works.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          setPhase("form");
          return;
        }
      }

      // `getSession` only reads the local cookie, so a stale or forged token
      // would still reach the form. `getUser` verifies the recovery session
      // with the auth server and fails closed when it is no longer valid.
      const { data, error } = await supabase.auth.getUser();
      setPhase(!error && data.user ? "form" : "invalid");
    };

    establish().catch(() => setPhase("invalid"));
  }, []);

  useEffect(() => {
    if (phase === "success") successHeadingRef.current?.focus();
    if (phase === "invalid") invalidHeadingRef.current?.focus();
  }, [phase]);

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (passwordError) setPasswordError(validateNewPassword(value));
    if (confirmError && confirmPassword) {
      setConfirmError(value === confirmPassword ? null : "Passwords do not match.");
    }
    if (formError) setFormError(null);
  }

  function handleConfirmChange(value: string) {
    setConfirmPassword(value);
    if (confirmError) {
      setConfirmError(value === password ? null : "Passwords do not match.");
    }
    if (formError) setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    const nextPasswordError = validateNewPassword(password);
    const nextConfirmError =
      password === confirmPassword ? null : "Passwords do not match.";

    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);

    if (nextPasswordError) {
      passwordRef.current?.focus();
      return;
    }
    if (nextConfirmError) {
      confirmRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.updateUser({ password });

      if (error) throw error;
      if (!data.user) {
        throw new Error("Password update did not return a user.");
      }

      // The recovery session must not double as a dashboard session. Clearing
      // it locally forces a normal sign-in with the new password while leaving
      // the user's other devices untouched.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

      // Never keep the plaintext password in component state after the
      // provider has accepted it.
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirm(false);

      setPhase("success");
    } catch (error) {
      if (isMissingSessionError(error)) {
        setPhase("invalid");
        return;
      }
      setFormError(passwordUpdateMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (phase === "checking") {
    return (
      <AuthShell labelledBy="reset-checking-title">
        <div
          role="status"
          aria-live="polite"
          className={`${styles.panel} flex flex-col items-center py-6 text-center`}
        >
          <Loader2
            className="h-7 w-7 animate-spin text-[#2563EB]"
            aria-hidden="true"
          />
          <h1
            id="reset-checking-title"
            className="mt-4 text-[18px] font-bold text-[#0F172A]"
          >
            Checking your reset link…
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            This will only take a moment.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthShell labelledBy="reset-invalid-title">
        <div className={styles.panel}>
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <ShieldAlert
                className="h-7 w-7"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
          </div>

          <h1
            id="reset-invalid-title"
            ref={invalidHeadingRef}
            tabIndex={-1}
            className="mt-5 text-center text-[24px] font-bold leading-tight tracking-tight text-[#0F172A] outline-none sm:text-[26px]"
          >
            This reset link is invalid or has expired
          </h1>
          <p className="mt-2.5 text-center text-[14px] leading-relaxed text-slate-500">
            Reset links are single-use and expire after a short time. Request a
            new link to continue.
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <Link href="/forgot-password" className={PRIMARY_BUTTON}>
              Request a new link
            </Link>
            <Link href="/login" className={SECONDARY_BUTTON}>
              Back to login
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (phase === "success") {
    return (
      <AuthShell labelledBy="reset-success-title">
        <div className={styles.panel}>
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2
                className="h-7 w-7"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
          </div>

          <h1
            id="reset-success-title"
            ref={successHeadingRef}
            tabIndex={-1}
            className="mt-5 text-center text-[24px] font-bold leading-tight tracking-tight text-[#0F172A] outline-none sm:text-[26px]"
          >
            Password reset successful
          </h1>
          <p className="mt-2.5 text-center text-[14px] leading-relaxed text-slate-500">
            Your password has been updated. You can now sign in using your new
            password.
          </p>

          <Link href="/login" className={`${PRIMARY_BUTTON} mt-6`}>
            Back to login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell labelledBy="reset-title">
      <div className={styles.panel}>
        <div className="flex justify-center">
          <Logo />
        </div>

        <h1
          id="reset-title"
          className="mt-6 text-[26px] font-bold leading-tight tracking-tight text-[#0F172A] sm:text-[28px]"
        >
          Set a new password
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
          Choose a new password for your Daong account.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="new-password"
              className="text-[13px] font-semibold text-slate-700"
            >
              New password
            </label>
            <div className="relative">
              <input
                ref={passwordRef}
                id="new-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                maxLength={72}
                value={password}
                onChange={(event) => handlePasswordChange(event.target.value)}
                placeholder="Enter a new password"
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={
                  passwordError
                    ? "password-policy new-password-error"
                    : "password-policy"
                }
                className={`${FIELD_BASE} ${
                  passwordError ? FIELD_INVALID : FIELD_IDLE
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p
              id="password-policy"
              className="text-[12px] leading-snug text-slate-500"
            >
              {PASSWORD_POLICY_HINT}
            </p>
            <p
              id="new-password-error"
              aria-live="polite"
              className={`min-h-[18px] text-[12.5px] font-medium ${
                passwordError ? "text-rose-600" : "text-transparent"
              }`}
            >
              {passwordError ?? "\u00A0"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="confirm-password"
              className="text-[13px] font-semibold text-slate-700"
            >
              Confirm new password
            </label>
            <div className="relative">
              <input
                ref={confirmRef}
                id="confirm-password"
                name="confirm-password"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                maxLength={72}
                value={confirmPassword}
                onChange={(event) => handleConfirmChange(event.target.value)}
                placeholder="Re-enter the new password"
                aria-invalid={confirmError ? true : undefined}
                aria-describedby={
                  confirmError ? "confirm-password-error" : undefined
                }
                className={`${FIELD_BASE} ${
                  confirmError ? FIELD_INVALID : FIELD_IDLE
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((visible) => !visible)}
                aria-label={
                  showConfirm ? "Hide confirmation password" : "Show confirmation password"
                }
                aria-pressed={showConfirm}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p
              id="confirm-password-error"
              aria-live="polite"
              className={`min-h-[18px] text-[12.5px] font-medium ${
                confirmError ? "text-rose-600" : "text-transparent"
              }`}
            >
              {confirmError ?? "\u00A0"}
            </p>
          </div>

          {formError && <ErrorBox message={formError} />}

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className={`${PRIMARY_BUTTON} mt-1`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Updating password…
              </>
            ) : (
              "Reset password"
            )}
          </button>
        </form>

        <p className="mt-6 border-t border-slate-100 pt-5 text-center text-[13px] text-slate-500">
          <Link href="/login" className={LINK}>
            Back to login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
