"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Never log the raw message to the UI; this is the server-side signal
    // that an operator can correlate with the deployment logs.
    console.error("[app] unhandled route error:", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section
        role="alert"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_-24px_rgba(15,27,61,0.25)]"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          This page could not be loaded. Your data has not been changed. Try
          again, or return to your dashboard.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[11px] font-medium text-slate-400">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Go to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
