"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import ModalShell from "@/components/shared/ModalShell";
import { createClient } from "@/lib/supabase/client";
import type { Output, Profile } from "@/lib/types";
import EmployeeTopBar from "../EmployeeTopBar";
import StaffHeader from "../StaffHeader";
import StaffSidebar from "../StaffSidebar";
import SubmitDeliverableCard from "../SubmitDeliverableCard";
import FilterSelect from "./FilterSelect";
import OutputDetailsDrawer from "./OutputDetailsDrawer";
import OutputItem from "./OutputItem";
import OutputSummaryCards from "./OutputSummaryCards";
import {
  PAGE_SIZE,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  matchesRange,
  matchesSearch,
  pageWindow,
  sortOutputs,
  type OutputCounts,
  type PreviewState,
  type SortMode,
  type StatusFilter,
  type TypeFilter,
  type ViewMode,
} from "./my-outputs-ui";
import { useFocusTrap } from "./use-focus-trap";

export interface MyOutputsViewProps {
  profile: Profile;
  /** The staff member's own outputs — never another user's. */
  outputs: Output[];
  /** Exact counts from the full `outputs` status query. */
  counts: OutputCounts;
  /** Same rule as the dashboard: work can be submitted after today's clock-in. */
  clockedIn: boolean;
  /** Set when either database query failed; the page shows an error panel. */
  loadError: string | null;
  /** True when the newest columns were unavailable (migration not run yet). */
  legacyColumns: boolean;
}

interface ContentEntry {
  state: PreviewState;
  text?: string;
}

interface ToastMessage {
  tone: "success" | "error";
  text: string;
}

export default function MyOutputsView({
  profile,
  outputs,
  counts,
  clockedIn,
  loadError,
  legacyColumns,
}: MyOutputsViewProps) {
  const router = useRouter();
  // One browser client for the lifetime of the page (realtime only).
  const supabase = useMemo(() => createClient(), []);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<ViewMode>("card");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [contentById, setContentById] = useState<Record<string, ContentEntry>>({});
  const contentRef = useRef<Record<string, ContentEntry>>({});
  const inFlight = useRef<Set<string>>(new Set());
  contentRef.current = contentById;

  const submitDialogRef = useRef<HTMLDivElement>(null);
  const submitTitleId = useId();
  useFocusTrap(submitDialogRef, submitOpen);

  // ------------------------------------------------------------ written body

  const loadContent = useCallback(async (id: string, force = false) => {
    const cached = contentRef.current[id];
    if (!force && (cached?.state === "ready" || cached?.state === "loading")) {
      return;
    }
    if (inFlight.current.has(id)) return;

    inFlight.current.add(id);
    setContentById((current) => ({ ...current, [id]: { state: "loading" } }));

    try {
      const response = await fetch(`/api/outputs/${id}/content`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("unavailable");
      const data = (await response.json()) as { content?: string };
      setContentById((current) => ({
        ...current,
        [id]: { state: "ready", text: data.content ?? "" },
      }));
    } catch {
      setContentById((current) => ({ ...current, [id]: { state: "error" } }));
    } finally {
      inFlight.current.delete(id);
    }
  }, []);

  // --------------------------------------------------------------- filtering

  const filtersActive =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    from !== "" ||
    to !== "";

  const resetFilters = useCallback(() => {
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setFrom("");
    setTo("");
    setPage(1);
  }, []);

  const filtered = useMemo(() => {
    const rows = outputs.filter(
      (row) =>
        (statusFilter === "all" || row.status === statusFilter) &&
        (typeFilter === "all" || row.attachment_type === typeFilter) &&
        matchesSearch(row, query) &&
        matchesRange(row, from, to)
    );
    return sortOutputs(rows, sort);
  }, [outputs, statusFilter, typeFilter, query, from, to, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // Changing any filter returns to the first page of the new result set.
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, typeFilter, from, to, sort]);

  // A refresh can shrink the collection under the current page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // ---------------------------------------------------------- sync + refresh

  useEffect(() => {
    setLastSyncedAt(new Date());
  }, [outputs]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Realtime: a Head decision lands here without a manual reload. Client
  // state (search, filters, page, open drawer) survives a router.refresh().
  useEffect(() => {
    const channel = supabase
      .channel(`staff-outputs:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outputs",
          filter: `employee_id=eq.${profile.id}`,
        },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile.id, router, supabase]);

  // Coming back to the tab is the other moment a status may have changed.
  useEffect(() => {
    function handleFocus() {
      if (document.visibilityState === "visible") router.refresh();
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [router]);

  // --------------------------------------------------------- preview loading

  // Only the visible page's written bodies are fetched, and each is fetched
  // once per visit. The list query itself deliberately excludes `content`.
  const previewKey = pageRows
    .filter(
      (row) =>
        row.attachment_type === "written" &&
        contentById[row.id]?.state !== "ready" &&
        contentById[row.id]?.state !== "error"
    )
    .map((row) => row.id)
    .join(",");

  useEffect(() => {
    if (!previewKey) return;
    for (const id of previewKey.split(",")) void loadContent(id);
  }, [previewKey, loadContent]);

  // --------------------------------------------------------------- details

  const selected = selectedId
    ? outputs.find((row) => row.id === selectedId) ?? null
    : null;

  // If a refresh removes the open row, close the drawer instead of showing
  // stale content.
  useEffect(() => {
    if (selectedId && !outputs.some((row) => row.id === selectedId)) {
      setSelectedId(null);
    }
  }, [outputs, selectedId]);

  const openDetails = useCallback(
    (row: Output) => {
      setSelectedId(row.id);
      if (row.attachment_type === "written") void loadContent(row.id);
    },
    [loadContent]
  );

  const closeDetails = useCallback(() => setSelectedId(null), []);

  // --------------------------------------------------------------- submit

  const handleSubmitted = useCallback(() => {
    setSubmitOpen(false);
    // Show the new pending row immediately, whatever was filtered before.
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setFrom("");
    setTo("");
    setSort("newest");
    setPage(1);
    setToast({
      tone: "success",
      text: "Output submitted — it's now pending review.",
    });
  }, []);

  // ------------------------------------------------------------------ render

  return (
    <div className={`${styles.page} min-h-screen font-sans antialiased text-staff-ink`}>
      <EmployeeTopBar
        employeeId={profile.id}
        employeeName={profile.full_name || "Staff"}
        employeeEmail={profile.email ?? null}
        employeeAvatarUrl={profile.profile_picture_url ?? null}
        initialTheme={profile.theme_preference ?? "light"}
        employeePosition={profile.position}
      />

      <StaffSidebar
        fullName={profile.full_name || "Staff"}
        position={profile.position}
        employeeId={profile.id}
        avatarUrl={profile.profile_picture_url}
      />

      <main className="mx-auto flex max-w-[1720px] flex-col gap-5 px-4 pt-16 sm:px-6 lg:gap-6 lg:px-8 lg:pb-12 lg:pt-8">
        <StaffHeader
          eyebrow="YOUR WORKSPACE"
          title="My Outputs"
          description="All your submitted work, organized in one place."
          fullName={profile.full_name || "Staff"}
          employeeId={profile.id}
          employeeEmail={profile.email ?? null}
          employeeAvatarUrl={profile.profile_picture_url ?? null}
          initialTheme={profile.theme_preference ?? "light"}
          employeePosition={profile.position}
          actionButton={
            <button
              type="button"
              onClick={() => setSubmitOpen(true)}
              className={`${styles.btnPrimary} inline-flex items-center gap-2 rounded-full bg-staff-blue px-4 py-2 text-xs font-bold text-white shadow-sm`}
            >
              <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              <span>Submit Output</span>
            </button>
          }
        />

        {loadError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-2xl border border-staff-danger-border bg-white px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,27,61,0.04)]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-staff-danger-soft text-staff-danger">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-staff-ink">
                We couldn&apos;t load your outputs
              </h2>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-staff-body">
                Your submissions are safe. We just couldn&apos;t fetch the list, so
                no counts are shown.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.refresh()}
              className={`${styles.btnPrimary} inline-flex items-center gap-1.5 rounded-xl bg-staff-blue px-3.5 py-2 text-[11.5px] font-bold text-white`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : (
          <>
            <OutputSummaryCards counts={counts} />

            {legacyColumns && (
              <p className="flex items-start gap-2 rounded-xl border border-staff-warning-border bg-staff-warning-soft px-3.5 py-2.5 text-[11px] font-medium leading-relaxed text-staff-warning">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Review dates and file details will appear after the latest
                  database migration is applied. Everything else already works.
                </span>
              </p>
            )}

            {counts.total > 0 && (
              <section
                aria-label="Search and filters"
                className={`${styles.enter} flex flex-col gap-3 rounded-2xl border border-staff-border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.05)]`}
                style={{ "--mo-delay": "300ms" } as CSSProperties}
              >
                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                  <div
                    className={`${styles.field} relative flex w-full items-center gap-2 rounded-xl border border-staff-border bg-white px-3 py-2 lg:max-w-sm`}
                  >
                    <Search
                      className="h-4 w-4 shrink-0 text-staff-muted"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      inputMode="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search title, filename or note"
                      aria-label="Search your outputs"
                      className="w-full bg-transparent text-xs font-medium text-staff-ink placeholder:text-staff-muted outline-none"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                        className="shrink-0 rounded-full p-0.5 text-staff-muted transition-colors duration-150 hover:bg-staff-chip hover:text-staff-ink"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:ml-auto lg:flex lg:items-center">
                    <FilterSelect
                      label="Filter by status"
                      value={statusFilter}
                      options={STATUS_OPTIONS}
                      onChange={(value) => setStatusFilter(value as StatusFilter)}
                      className="lg:w-[10.5rem]"
                    />
                    <FilterSelect
                      label="Filter by submission type"
                      value={typeFilter}
                      options={TYPE_OPTIONS}
                      onChange={(value) => setTypeFilter(value as TypeFilter)}
                      className="lg:w-[10.5rem]"
                    />
                    <FilterSelect
                      label="Sort submissions"
                      value={sort}
                      options={SORT_OPTIONS}
                      onChange={(value) => setSort(value as SortMode)}
                      className="col-span-2 sm:col-span-1 lg:w-[9.5rem]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-2.5 border-t border-staff-border/70 pt-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-staff-muted">
                      From
                      <input
                        type="date"
                        value={from}
                        max={to || undefined}
                        onChange={(event) => setFrom(event.target.value)}
                        className={`${styles.field} w-[9.5rem] rounded-lg border border-staff-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-staff-ink`}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-staff-muted">
                      To
                      <input
                        type="date"
                        value={to}
                        min={from || undefined}
                        onChange={(event) => setTo(event.target.value)}
                        className={`${styles.field} w-[9.5rem] rounded-lg border border-staff-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-staff-ink`}
                      />
                    </label>

                    {filtersActive && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className={`${styles.btnGhost} rounded-lg border border-staff-border bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-staff-body`}
                      >
                        Reset filters
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      aria-live="polite"
                      className="text-[10.5px] font-semibold text-staff-muted tabular-nums"
                    >
                      {filtered.length > 0
                        ? `Showing ${pageStart + 1}–${Math.min(
                            pageStart + PAGE_SIZE,
                            filtered.length
                          )} of ${filtered.length}`
                        : "No results"}
                    </span>

                    <span
                      className="hidden text-[10px] font-medium text-staff-muted sm:inline"
                      title="Statuses update automatically when a supervisor reviews your work"
                    >
                      Live
                      {lastSyncedAt
                        ? ` · updated ${lastSyncedAt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </span>

                    <div
                      className={styles.segmented}
                      role="group"
                      aria-label="View mode"
                    >
                      <button
                        type="button"
                        onClick={() => setView("card")}
                        aria-pressed={view === "card"}
                        aria-label="Card view"
                        title="Card view"
                        className={`${styles.segBtn} ${
                          view === "card" ? styles.segBtnActive : ""
                        }`}
                      >
                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("list")}
                        aria-pressed={view === "list"}
                        aria-label="List view"
                        title="List view"
                        className={`${styles.segBtn} ${
                          view === "list" ? styles.segBtnActive : ""
                        }`}
                      >
                        <List className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {counts.total === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-staff-border bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.05)]">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-staff-soft text-staff-blue-ink">
                  <FileText className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-staff-ink">
                    No outputs submitted yet
                  </h2>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-staff-body">
                    Your submitted work will appear here so you can track its review
                    status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitOpen(true)}
                  className={`${styles.btnPrimary} mt-2 inline-flex items-center gap-2 rounded-full bg-staff-blue px-4 py-2.5 text-xs font-bold text-white`}
                >
                  <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                  Submit Your First Output
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-staff-border bg-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(15,27,61,0.04)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-staff-chip text-staff-muted">
                  <Search className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-staff-ink">
                    No matching outputs
                  </h2>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-staff-body">
                    Try adjusting your search or filters.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetFilters}
                  className={`${styles.btnGhost} rounded-xl border border-staff-border bg-white px-3.5 py-2 text-[11.5px] font-bold text-staff-ink`}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <>
                {view === "card" ? (
                  <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                    {pageRows.map((row) => (
                      <OutputItem
                        key={row.id}
                        output={row}
                        view="card"
                        preview={contentById[row.id]?.text}
                        previewState={contentById[row.id]?.state ?? "idle"}
                        onOpen={openDetails}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-staff-border bg-white shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.05)]">
                    {pageRows.map((row) => (
                      <OutputItem
                        key={row.id}
                        output={row}
                        view="list"
                        preview={contentById[row.id]?.text}
                        previewState={contentById[row.id]?.state ?? "idle"}
                        onOpen={openDetails}
                      />
                    ))}
                  </div>
                )}

                {filtered.length > PAGE_SIZE && (
                  <nav
                    aria-label="Outputs pagination"
                    className="flex flex-wrap items-center justify-center gap-1.5 pt-1"
                  >
                    <button
                      type="button"
                      onClick={() => setPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      aria-label="Previous page"
                      className={`${styles.btnGhost} flex h-8 w-8 items-center justify-center rounded-lg border border-staff-border bg-white text-staff-body`}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {pageWindow(currentPage, totalPages).map((entry, index) =>
                      entry === "gap" ? (
                        <span
                          key={`gap-${index}`}
                          className="px-1 text-[11px] font-bold text-staff-muted"
                          aria-hidden="true"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={entry}
                          type="button"
                          onClick={() => setPage(entry)}
                          aria-current={entry === currentPage ? "page" : undefined}
                          aria-label={`Page ${entry}`}
                          className={`h-8 min-w-8 rounded-lg border px-2 text-[11px] font-bold tabular-nums transition-colors duration-150 ${
                            entry === currentPage
                              ? "border-staff-blue bg-staff-blue text-white"
                              : "border-staff-border bg-white text-staff-body hover:bg-staff-soft hover:text-staff-blue-ink"
                          }`}
                        >
                          {entry}
                        </button>
                      )
                    )}

                    <button
                      type="button"
                      onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      aria-label="Next page"
                      className={`${styles.btnGhost} flex h-8 w-8 items-center justify-center rounded-lg border border-staff-border bg-white text-staff-body`}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </main>

      <OutputDetailsDrawer
        output={selected}
        content={selected ? contentById[selected.id] : undefined}
        onReloadContent={(id) => void loadContent(id, true)}
        onClose={closeDetails}
      />

      <ModalShell
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        maxWidthClass="max-w-2xl"
        ariaLabelledBy={submitTitleId}
      >
        <div ref={submitDialogRef} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200/90 px-5 py-4 sm:px-6 dark:border-slate-700/80">
            <div>
              <h2
                id={submitTitleId}
                className="text-[15px] font-extrabold text-staff-ink"
              >
                Submit an output
              </h2>
              <p className="mt-0.5 text-[11.5px] text-staff-body">
                Write it, upload it, or link it — then send it for review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitOpen(false)}
              aria-label="Close submission form"
              className="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
            <SubmitDeliverableCard
              embedded
              clockedIn={clockedIn}
              onSubmitted={handleSubmitted}
            />
          </div>
        </div>
      </ModalShell>

      {toast && (
        <div
          role="status"
          className={`animate-fade-in fixed bottom-6 right-4 z-[120] flex max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs font-bold shadow-xl sm:right-6 ${
            toast.tone === "success"
              ? "border-staff-success-border bg-staff-success-soft text-staff-success"
              : "border-staff-danger-border bg-staff-danger-soft text-staff-danger"
          }`}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 leading-relaxed">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-full p-0.5 transition-colors duration-150 hover:bg-white/60"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
