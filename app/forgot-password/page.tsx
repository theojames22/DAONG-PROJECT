"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus("idle");
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      });

      if (error) throw error;

      setStatus("success");
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
              <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Check your email</h1>
              <p className="text-[14px] text-ink-muted">
                If an account exists with this email, you'll receive a password reset link.
              </p>
            </div>
            <button
              onClick={() => router.push("/login")}
              className="neu-button neu-focus mt-8 w-full rounded-2xl py-3 text-[14px] font-semibold text-accent-dark"
            >
              Back to Login
            </button>
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
            <h1 className="font-display text-2xl font-semibold text-ink">Forgot Password</h1>
            <p className="mt-2 text-[14px] text-ink-muted">
              Enter your email address and we'll send you a password reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-[13px] font-medium text-ink-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
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
              {isSubmitting ? "Sending..." : "Send Reset Link"}
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
