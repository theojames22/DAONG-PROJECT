/**
 * Instant navigation state for every /employee route. Same contract as the
 * head skeleton: a shape-matched placeholder replaces the outgoing page the
 * moment a navigation starts, so the old page cannot be clicked or submitted
 * while the server responds. `.skeleton-delayed` keeps it invisible for the
 * first 120 ms so cached navigations do not flash.
 */
export default function EmployeeLoading() {
  return (
    <div className="min-h-screen text-staff-ink" aria-busy="true" aria-live="polite" data-route-loading>
      <span className="sr-only">Loading page…</span>

      <main className="mx-auto flex max-w-[1720px] flex-col gap-6 px-4 pt-16 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
        <div className="skeleton-delayed flex flex-col gap-6">
          {/* Greeting / page header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="skeleton-shimmer h-8 w-56 max-w-[60vw] rounded-lg bg-[var(--surface-2)]" />
              <div className="skeleton-shimmer h-4 w-80 max-w-[70vw] rounded-md bg-[var(--surface-2)]" />
            </div>
            <div className="skeleton-shimmer h-11 w-32 rounded-xl bg-[var(--surface-2)]" />
          </div>

          {/* Clock-in card + summary */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="skeleton-shimmer h-[260px] rounded-container bg-[var(--surface-2)] lg:col-span-2" />
            <div className="skeleton-shimmer h-[260px] rounded-container bg-[var(--surface-2)]" />
          </div>

          {/* List panel */}
          <div className="skeleton-shimmer h-[280px] rounded-container bg-[var(--surface-2)]" />
        </div>
      </main>
    </div>
  );
}
