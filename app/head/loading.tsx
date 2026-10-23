/**
 * Instant navigation state for every /head route.
 *
 * Clicking a sidebar link no longer leaves the previous page mounted (and
 * clickable) until the server responds: this boundary is rendered inside the
 * head layout, so the sidebar/top bar stay put and only the page area is
 * swapped for a shape-matched skeleton. The 120 ms fade-in delay in
 * `.skeleton-delayed` means a navigation served from the router cache never
 * flashes it.
 *
 * It is a pure placeholder — no focus trap, no pointer blocking, and no state
 * to get stuck in, so back/forward and a failed navigation behave exactly as
 * before.
 */
export default function HeadLoading() {
  return (
    <div className="flex w-full flex-col gap-6 pb-8" aria-busy="true" aria-live="polite" data-route-loading>
      <span className="sr-only">Loading page…</span>

      <div className="skeleton-delayed flex flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="skeleton-shimmer h-8 w-64 max-w-[60vw] rounded-lg bg-[var(--surface-2)]" />
            <div className="skeleton-shimmer h-4 w-96 max-w-[70vw] rounded-md bg-[var(--surface-2)]" />
          </div>
          <div className="skeleton-shimmer h-11 w-36 rounded-xl bg-[var(--surface-2)]" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton-shimmer h-[132px] rounded-container bg-[var(--surface-2)]"
            />
          ))}
        </div>

        {/* Primary panel */}
        <div className="skeleton-shimmer h-[300px] rounded-container bg-[var(--surface-2)]" />

        {/* Two-column panels */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="skeleton-shimmer h-[280px] rounded-container bg-[var(--surface-2)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
