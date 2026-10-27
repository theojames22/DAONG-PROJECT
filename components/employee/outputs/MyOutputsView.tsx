"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
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
import ImageLightbox, { type LightboxImage } from "./ImageLightbox";
import OutputDetailsDrawer from "./OutputDetailsDrawer";
import OutputItem from "./OutputItem";
import OutputSummaryCards from "./OutputSummaryCards";
import {
  PAGE_SIZE,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  formatChipDate,
  latestSubmissionAt,
  matchesRange,
  matchesSearch,
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

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
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
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

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

  const resetFilters = useCallback(() => {
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSort("newest");
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
  const latestAt = useMemo(() => latestSubmissionAt(outputs), [outputs]);

  // Changing any filter returns to the first page of the new result set.
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, typeFilter, from, to, sort]);

  // A refresh can shrink the collection under the current page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];

    if (query.trim()) {
      chips.push({
        key: "query",
        label: `Search: “${query.trim()}”`,
        onRemove: () => setQuery(""),
      });
    }

    if (statusFilter !== "all") {
      const label =
        STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ??
        statusFilter;
      chips.push({
        key: "status",
        label: `Status: ${label}`,
        onRemove: () => setStatusFilter("all"),
      });
    }

    if (typeFilter !== "all") {
      const label =
        TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label ??
        typeFilter;
      chips.push({
        key: "type",
        label: `Type: ${label}`,
        onRemove: () => setTypeFilter("all"),
      });
    }

    if (from) {
      chips.push({
        key: "from",
        label: `From ${formatChipDate(from)}`,
        onRemove: () => setFrom(""),
      });
    }

    if (to) {
      chips.push({
        key: "to",
        label: `To ${formatChipDate(to)}`,
        onRemove: () => setTo(""),
      });
    }

    if (sort !== "newest") {
      chips.push({
        key: "sort",
        label: "Oldest first",
        onRemove: () => setSort("newest"),
      });
    }

    return chips;
  }, [query, statusFilter, typeFilter, from, to, sort]);

  const filtersActive = activeChips.length > 0;

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

  const handleRefresh = useCallback(() => {
    startRefresh(() => router.refresh());
  }, [router, startRefresh]);

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
      setLightbox(null);
    }
  }, [outputs, selectedId]);

  const openDetails = useCallback(
    (row: Output) => {
      setSelectedId(row.id);
      if (row.attachment_type === "written") void loadContent(row.id);
    },
    [loadContent]
  );

  const closeDetails = useCallback(() => {
    setSelectedId(null);
    setLightbox(null);
  }, []);

  const openImage = useCallback((image: LightboxImage) => {
    setLightbox(image);
  }, []);

  const closeImage = useCallback(() => setLightbox(null), []);

  // --------------------------------------------------------------- submit

  const handleSubmitted = useCallback(() => {
    setSubmitOpen(false);
    // Show the new pending row immediately, whatever was filtered before.
    resetFilters();
    setToast({
      tone: "success",
      text: "Output submitted — it's now pending review.",
    });
  }, [resetFilters]);

  const resultCopy =
    filtered.length > 0
      ? `Showing ${pageStart + 1}–${Math.min(
          pageStart + PAGE_SIZE,
          filtered.length
        )} of ${filtered.length}`
      : "No results";

  // ------------------------------------------------------------------ render

  return (
    <div
      className={`${styles.scope} ${styles.page} min-h-screen font-sans antialiased`}
    >
      <svg
        className={styles.drift}
        viewBox="0 0 1440 360"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M-40 306C220 246 360 326 640 256C920 186 1100 176 1480 268"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M-40 338C240 278 390 352 680 286C970 220 1140 214 1480 300"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>

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

      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 pb-14 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6">
          <StaffHeader
            eyebrow="YOUR WORKSPACE"
            title="My Outputs"
            description="Manage and track all your submitted outputs in one place."
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
                className={`${styles.primaryBtn} whitespace-nowrap`}
              >
                <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                <span>Submit Output</span>
              </button>
            }
          />

          <OutputSummaryCards
            counts={counts}
            activeStatus={statusFilter}
            onSelectStatus={setStatusFilter}
            latestAt={latestAt}
            unavailable={Boolean(loadError)}
          />

          {loadError ? (
            <div
              role="alert"
              className={`${styles.enter} flex flex-col items-center gap-4 rounded-[28px] px-6 py-14 text-center`}
              style={{
                background: "var(--mo-card)",
                boxShadow: "var(--mo-shadow-card)",
                animationDelay: "140ms",
              }}
            >
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{
                  background: "var(--mo-danger-soft)",
                  color: "var(--mo-danger)",
                }}
              >
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </span>
              <div>
                <h2
                  className="text-[19px] font-extrabold tracking-[-0.02em]"
                  style={{ color: "var(--mo-ink)" }}
                >
                  We couldn&apos;t load your outputs
                </h2>
                <p
                  className="mx-auto mt-1.5 max-w-md text-[13.5px] font-medium leading-relaxed"
                  style={{ color: "var(--mo-body)" }}
                >
                  Your submissions are safe. We just couldn&apos;t fetch the list,
                  so no counts are shown.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={styles.ghostBtn}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Retry
              </button>
            </div>
          ) : (
            <>
              {legacyColumns && (
                <p
                  className={`${styles.enter} flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[12.5px] font-medium leading-relaxed`}
                  style={{
                    background: "var(--mo-warning-soft)",
                    color: "var(--mo-warning-ink)",
                    animationDelay: "120ms",
                  }}
                >
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Review dates and file details will appear after the latest
                    database migration is applied. Everything else already works.
                  </span>
                </p>
              )}

              {counts.total > 0 && (
                <section
                  aria-label="Search and filters"
                  className={`${styles.enter} ${styles.filtersShell}`}
                  style={{ "--mo-delay": "140ms" } as CSSProperties}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className={`${styles.search} w-full xl:flex-1`}>
                      <Search
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        inputMode="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search title, filename, note or link"
                        aria-label="Search your outputs"
                        className={styles.searchInput}
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          aria-label="Clear search"
                          className="shrink-0 rounded-full p-1 transition-colors duration-150 hover:bg-[var(--mo-soft)]"
                          style={{ color: "var(--mo-muted)" }}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:w-[34rem]">
                      <FilterSelect
                        label="Filter by status"
                        value={statusFilter}
                        options={STATUS_OPTIONS}
                        onChange={(value) =>
                          setStatusFilter(value as StatusFilter)
                        }
                      />
                      <FilterSelect
                        label="Filter by submission type"
                        value={typeFilter}
                        options={TYPE_OPTIONS}
                        onChange={(value) => setTypeFilter(value as TypeFilter)}
                      />
                      <FilterSelect
                        label="Sort submissions"
                        value={sort}
                        options={SORT_OPTIONS}
                        onChange={(value) => setSort(value as SortMode)}
                        className="col-span-2 sm:col-span-1"
                      />
                    </div>
                  </div>

                  <div
                    className="flex flex-wrap items-end justify-between gap-3 border-t pt-4"
                    style={{ borderColor: "var(--mo-hair)" }}
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <label className={styles.dateField}>
                        <span className={styles.dateLabel}>From</span>
                        <input
                          type="date"
                          value={from}
                          max={to || undefined}
                          onChange={(event) => setFrom(event.target.value)}
                          className={styles.dateInput}
                          aria-label="Submitted from date"
                        />
                      </label>
                      <label className={styles.dateField}>
                        <span className={styles.dateLabel}>To</span>
                        <input
                          type="date"
                          value={to}
                          min={from || undefined}
                          onChange={(event) => setTo(event.target.value)}
                          className={styles.dateInput}
                          aria-label="Submitted to date"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        aria-live="polite"
                        className={styles.resultNote}
                      >
                        {resultCopy}
                      </span>

                      <span className={styles.liveNote}>
                        <span className={styles.livedot} aria-hidden="true" />
                        Live
                        {lastSyncedAt
                          ? ` · updated ${lastSyncedAt.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : ""}
                      </span>

                      <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        aria-label={
                          isRefreshing ? "Refreshing outputs" : "Refresh outputs"
                        }
                        title="Refresh outputs"
                        className={styles.iconBtn}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${
                            isRefreshing ? "animate-spin" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>

                      <div
                        className={styles.segWrap}
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
                            view === "card" ? styles.segBtnOn : ""
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
                            view === "list" ? styles.segBtnOn : ""
                          }`}
                        >
                          <List className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {filtersActive && (
                    <div className="flex flex-wrap items-center gap-2">
                      {activeChips.map((chip) => (
                        <span key={chip.key} className={styles.chip}>
                          <span className="max-w-[260px] truncate">
                            {chip.label}
                          </span>
                          <button
                            type="button"
                            onClick={chip.onRemove}
                            aria-label={`Remove filter: ${chip.label}`}
                            className={styles.chipRemove}
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={resetFilters}
                        className={styles.linkBtn}
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </section>
              )}

              {counts.total === 0 ? (
                <div
                  className={`${styles.enter} flex flex-col items-center gap-4 rounded-[28px] px-6 py-16 text-center`}
                  style={{
                    background: "var(--mo-card)",
                    boxShadow: "var(--mo-shadow-card)",
                    animationDelay: "220ms",
                  }}
                >
                  <span
                    className="grid h-16 w-16 place-items-center rounded-[22px]"
                    style={{
                      background:
                        "linear-gradient(140deg, var(--mo-blue-soft), var(--mo-soft))",
                      color: "var(--mo-blue-ink)",
                    }}
                  >
                    <FileText className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div>
                    <h2
                      className="text-[20px] font-extrabold tracking-[-0.02em]"
                      style={{ color: "var(--mo-ink)" }}
                    >
                      No outputs submitted yet
                    </h2>
                    <p
                      className="mx-auto mt-1.5 max-w-md text-[13.5px] font-medium leading-relaxed"
                      style={{ color: "var(--mo-body)" }}
                    >
                      Once you send your first written output, file, image or
                      link, it will appear here with its review progress.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubmitOpen(true)}
                    className={styles.primaryBtn}
                  >
                    <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                    Submit Your First Output
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div
                  className={`${styles.enter} flex flex-col items-center gap-4 rounded-[28px] px-6 py-14 text-center`}
                  style={{
                    background: "var(--mo-card)",
                    boxShadow: "var(--mo-shadow-card)",
                    animationDelay: "220ms",
                  }}
                >
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl"
                    style={{
                      background: "var(--mo-soft)",
                      color: "var(--mo-muted)",
                    }}
                  >
                    <Search className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2
                      className="text-[18px] font-extrabold tracking-[-0.01em]"
                      style={{ color: "var(--mo-ink)" }}
                    >
                      No outputs match these filters
                    </h2>
                    <p
                      className="mx-auto mt-1.5 max-w-sm text-[13.5px] font-medium leading-relaxed"
                      style={{ color: "var(--mo-body)" }}
                    >
                      Try a different search, status, type or date range.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className={styles.ghostBtn}
                  >
                    Clear search and filters
                  </button>
                </div>
              ) : (
                <>
                  {view === "card" ? (
                    <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
                      {pageRows.map((row, index) => (
                        <OutputItem
                          key={row.id}
                          output={row}
                          view="card"
                          preview={contentById[row.id]?.text}
                          previewState={contentById[row.id]?.state ?? "idle"}
                          onOpen={openDetails}
                          onOpenImage={openImage}
                          delayMs={Math.min(index * 45, 270)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {pageRows.map((row, index) => (
                        <OutputItem
                          key={row.id}
                          output={row}
                          view="list"
                          preview={contentById[row.id]?.text}
                          previewState={contentById[row.id]?.state ?? "idle"}
                          onOpen={openDetails}
                          onOpenImage={openImage}
                          delayMs={Math.min(index * 35, 210)}
                        />
                      ))}
                    </div>
                  )}

                  <nav
                    aria-label="Outputs pagination"
                    className="flex flex-wrap items-center justify-end gap-3 px-1 pt-1"
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        aria-label="Previous page"
                        className={styles.ghostBtn}
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        Previous
                      </button>
                      <span
                        className="text-[12.5px] font-bold tabular-nums"
                        style={{ color: "var(--mo-muted)" }}
                      >
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                        aria-label="Next page"
                        className={styles.ghostBtn}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </nav>
                </>
              )}
            </>
          )}
        </div>
      </main>

      <OutputDetailsDrawer
        output={selected}
        content={selected ? contentById[selected.id] : undefined}
        onReloadContent={(id) => void loadContent(id, true)}
        onClose={closeDetails}
        onOpenImage={openImage}
        imageOpen={Boolean(lightbox)}
      />

      <ImageLightbox
        image={lightbox}
        onClose={closeImage}
        lockScroll={!selected}
      />

      <ModalShell
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        maxWidthClass="max-w-[600px]"
        ariaLabelledBy={submitTitleId}
        className={`${styles.scope} ${styles.modalDialog} !rounded-[30px] !border-0 !bg-[color:var(--mo-card)]`}
        backdropClassName="bg-[rgba(12,22,48,0.55)] backdrop-blur-[6px]"
      >
        <div ref={submitDialogRef} className="flex min-h-0 flex-1 flex-col">
          <div className={styles.modalHeader}>
            <div className="min-w-0">
              <p className={styles.eyebrow}>New submission</p>
              <h2 id={submitTitleId} className={`${styles.modalTitle} mt-1`}>
                Submit an output
              </h2>
              <p className={styles.modalSub}>
                Write it, upload it, or link it — then send it for review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitOpen(false)}
              aria-label="Close submission form"
              className={styles.modalClose}
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>

          <div className={styles.modalBody}>
            <SubmitDeliverableCard
              embedded
              appearance="workspace"
              clockedIn={clockedIn}
              onSubmitted={handleSubmitted}
              onCancel={() => setSubmitOpen(false)}
            />
          </div>
        </div>
      </ModalShell>

      {toast && (
        <div role="status" className={`${styles.toast} flex items-center gap-3`}>
          <span className="inline-flex min-w-0 items-center gap-2.5">
            {toast.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 leading-relaxed">{toast.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-full p-1 transition-colors duration-150 hover:bg-white/15"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
