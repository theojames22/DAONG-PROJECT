"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(pwd)) return "Password must contain at least one letter.";
    if (!/[0-9]/.test(pwd)) return "Password must contain at least one number.";
    return null;
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setErrorMessage(null);

    const validationError = validatePassword(password);
    if (validationError) {
      setStatus("error");
      setErrorMessage(validationError);
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setStatus("success");
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="neu-raised rounded-neu px-8 py-10 text-center">
            <Logo />
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Password updated</h1>
              <p className="text-[14px] text-ink-muted">
                Your password has been successfully reset. Redirecting you to login...
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="neu-raised rounded-neu px-8 py-9 sm:px-10 sm:py-10">
          <Logo />
          <div className="mt-6 mb-7">
            <h1 className="font-display text-2xl font-semibold text-ink">Reset Password</h1>
            <p className="mt-2 text-[14px] text-ink-muted">
              Please enter your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-[13px] font-medium text-ink-muted">
                New Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="neu-pressed neu-focus rounded-2xl px-4 py-3 text-[14px] text-ink placeholder:text-ink-muted/60 outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="confirmPassword" className="text-[13px] font-medium text-ink-muted">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="neu-pressed neu-focus rounded-2xl px-4 py-3 text-[14px] text-ink placeholder:text-ink-muted/60 outline-none"
              />
            </div>

            {status === "error" && (
              <p role="alert" className="text-[13px] text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="neu-button neu-focus mt-2 rounded-2xl py-3.5 text-[14.5px] font-semibold text-accent-dark disabled:opacity-60"
            >
              {isSubmitting ? "Updating..." : "Update Password"}
            </button>
          </form>

          <div className="mt-7 text-center">
            <a
              href="/login"
              className="text-[13px] font-medium text-accent-dark hover:underline"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
