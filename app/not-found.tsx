import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_-24px_rgba(15,27,61,0.25)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
          404
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          The page you opened does not exist, or you no longer have access to
          it.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
