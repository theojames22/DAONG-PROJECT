"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
} from "lucide-react";
import { formatHours } from "@/lib/attendance";

export interface LeaderboardEntry {
  id: string;
  full_name: string | null;
  position: string | null;
  profile_picture_url?: string | null;
  /** Credited hours for the selected week (employee_week_hours view). */
  creditedHours: number;
  /** Weekly requirement in hours; 0 for anyone without a target. */
  requiredHours: number;
}

export interface WeeklyLeaderboardCardProps {
  /** Already sorted by credited hours (desc), then name. Up to 3 entries. */
  entries: LeaderboardEntry[];
  /** Compact Monday–Sunday label, e.g. "Oct 12 – Oct 18". */
  weekLabel: string;
  /** Date key (Monday) to load when the previous arrow is pressed. */
  prevWeek: string;
  /** Date key (Monday) to load when the next arrow is pressed. */
  nextWeek: string;
  /** False once the next week has not started yet, so it cannot be opened. */
  canGoNext: boolean;
  /** Set when the credited-hours query failed server-side. */
  error?: boolean;
}

const EPSILON = 1e-6;

const NAV_BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#DFE6F0] bg-white text-[#8193AE] transition-colors hover:border-[#C3D2EA] hover:text-[#2864F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DCE7FF] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#DFE6F0] disabled:hover:text-[#8193AE]";

function initialLetter(name: string | null): string {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/** 40 → "40h", 37.5 → "37.5h" — required targets are usually whole hours. */
function formatRequired(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/**
 * Progress toward the weekly requirement, as a percentage of required hours.
 *
 * The denominator is the Staff member's own required hours — NOT the highest
 * total on the board — so 1.3h of 40h reads as 3.25% rather than a full bar.
 * Credit above the target is capped at 100% for the fill while the numeric
 * value always shows the real total. A missing/zero requirement yields 0%
 * (no division by zero).
 */
function progressPercent(creditedHours: number, requiredHours: number): number {
  if (!(requiredHours > 0)) return 0;
  const pct = (creditedHours / requiredHours) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

function rowClasses(rank: number): string {
  if (rank === 1) return "border-[#D9E5FF] bg-[#F3F7FF]";
  if (rank === 2) return "border-[#EAEFF7] bg-[#F8FAFD]";
  if (rank === 3) return "border-[#F0E7DB] bg-[#FDFAF6]";
  return "border-[#EEF2F8] bg-white";
}

function rankBadgeClasses(rank: number): string {
  if (rank === 1) return "bg-[#2864F0] text-white";
  if (rank === 3) return "bg-[#F5E9DA] text-[#9A6A38]";
  return "bg-[#EDF1F7] text-[#64748B]";
}

/**
 * Weekly Leaderboard card for the Head dashboard.
 *
 * Ranks the top three Staff by CREDITED hours for the selected Monday–Sunday
 * week — the canonical employee_week_hours figure (attendance hours on days
 * that carry a submitted output and a closed clock), never raw logged time.
 * Heads are excluded upstream because the page only ever passes Staff.
 *
 * The card owns the only week selector: the `?week=` query param drives the
 * server page, which re-renders this card with fresh entries.
 */
export default function WeeklyLeaderboardCard({
  entries,
  weekLabel,
  prevWeek,
  nextWeek,
  canGoNext,
  error = false,
}: WeeklyLeaderboardCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const goToWeek = (week: string) => {
    if (isPending) return;
    startTransition(() => {
      router.push(`${pathname}?week=${week}`, { scroll: false });
    });
  };

  const retry = () => {
    if (isPending) return;
    startTransition(() => {
      router.refresh();
    });
  };

  // Ties share a rank (1, 2, 2 …) while the alphabet keeps a stable order.
  let lastHours: number | null = null;
  let lastRank = 0;
  const rows = entries.map((entry, index) => {
    const isTie = lastHours !== null && Math.abs(entry.creditedHours - lastHours) < EPSILON;
    const rank = isTie ? lastRank : index + 1;
    lastHours = entry.creditedHours;
    lastRank = rank;
    return { entry, rank };
  });

  return (
    <section className="flex w-full flex-col rounded-[17px] border border-[#E1E8F2] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] enter-up enter-d6">
      {/* Header: title/subtitle on the left, single week selector on the right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight text-[#17233B]">
            Weekly leaderboard
          </h2>
          <p className="mt-0.5 text-[11.5px] font-normal text-[#71809B]">
            Staff ranked by credited hours this week.
          </p>
        </div>

        <div
          role="group"
          aria-label="Select week"
          className="flex shrink-0 items-center gap-1.5 self-start"
          aria-busy={isPending}
        >
          <button
            type="button"
            onClick={() => goToWeek(prevWeek)}
            disabled={isPending}
            aria-label="Previous week"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>

          <span
            aria-live="polite"
            className="flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-[#EAF1FF] px-2.5 text-[11px] font-semibold text-[#2864F0]"
          >
            {isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            {weekLabel}
          </span>

          <button
            type="button"
            onClick={() => goToWeek(nextWeek)}
            disabled={!canGoNext || isPending}
            aria-label="Next week"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body — loading is checked first so the empty state never flashes
          while a week's data is still being fetched. */}
      {isPending ? (
        <div className="mt-3.5 flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-[14px] border border-[#EEF2F8] bg-white px-3 py-2.5 animate-pulse"
            >
              <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-[#EDF1F7]" />
              <span className="h-[34px] w-[34px] shrink-0 rounded-full bg-[#EDF1F7]" />
              <div className="min-w-0 flex-1">
                <span className="block h-3 w-1/3 rounded-full bg-[#EDF1F7]" />
                <span className="mt-2 block h-1.5 w-full rounded-full bg-[#EDF1F7]" />
              </div>
              <span className="h-4 w-10 shrink-0 rounded-full bg-[#EDF1F7]" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="my-4 flex flex-col items-center justify-center rounded-[14px] border border-dashed border-rose-200 bg-rose-50/40 px-6 py-8 text-center">
          <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-500">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
          </div>
          <p className="text-[12px] font-semibold text-[#17233B]">
            Couldn&rsquo;t load the leaderboard
          </p>
          <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[#71809B]">
            Something went wrong loading credited hours.
          </p>
          <button
            type="button"
            onClick={retry}
            disabled={isPending}
            className="mt-3 rounded-full bg-[#2864F0] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#1F55D6] disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="my-4 flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#DFE6F0] bg-[#F8FAFD] px-6 py-8 text-center">
          <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF1FF] text-[#2864F0]">
            <CalendarClock className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
          </div>
          <p className="text-[13px] font-semibold text-[#17233B]">
            No credited hours this week
          </p>
          <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[#71809B]">
            There are no credited hours recorded for this week yet. Try selecting another week.
          </p>
        </div>
      ) : (
        <div className="mt-3.5 flex flex-col gap-2">
          {rows.map(({ entry, rank }) => {
            const credited = entry.creditedHours;
            const required = entry.requiredHours;
            const pct = progressPercent(credited, required);
            const shortHours = required > 0 ? Math.max(0, required - credited) : 0;

            return (
              <div
                key={entry.id}
                className={`flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 ${rowClasses(rank)}`}
              >
                {/* Rank indicator */}
                <span
                  className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${rankBadgeClasses(
                    rank
                  )}`}
                  aria-label={`Rank ${rank}`}
                >
                  {rank === 1 ? (
                    <Crown className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    rank
                  )}
                </span>

                {/* Avatar */}
                {entry.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.profile_picture_url}
                    alt={entry.full_name || "Avatar"}
                    className="h-[34px] w-[34px] shrink-0 rounded-full object-cover ring-1 ring-[#D9E5FF]"
                  />
                ) : (
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#2864F0] text-[13px] font-bold text-white ring-1 ring-[#D9E5FF]">
                    {initialLetter(entry.full_name)}
                  </span>
                )}

                {/* Name + progress */}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="min-w-0 truncate text-[12px] font-semibold text-[#17233B]">
                      {entry.full_name || "Unnamed"}
                    </p>
                    {rank === 1 && (
                      <span className="shrink-0 rounded-full bg-[#2864F0] px-1.5 py-[3px] text-[9px] font-semibold leading-none text-white">
                        Top performer
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5">
                    {rank === 1 && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2864F0]"
                        aria-hidden="true"
                      />
                    )}
                    <div className="h-1.5 w-full min-w-[40px] overflow-hidden rounded-full bg-[#E4EAF5]">
                      <div
                        className="h-full rounded-full bg-[#2864F0] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {shortHours > 0 && (
                    <p className="mt-1 text-[9px] font-medium text-[#A45A00]">
                      Short {formatHours(shortHours)}
                    </p>
                  )}
                </div>

                {/* Credited hours (+ required reference) */}
                <div className="shrink-0 pl-1 text-right">
                  <p className="text-[16px] font-bold leading-none tabular-nums text-[#17233B]">
                    {formatHours(credited)}
                  </p>
                  {required > 0 && (
                    <p className="mt-1 text-[9.5px] font-medium text-[#94A3B8]">
                      of {formatRequired(required)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <p className="mt-3.5 text-[10px] font-normal leading-relaxed text-[#94A3B8]">
        Week runs Monday to Sunday and resets every Monday. Ties share a rank.
      </p>
    </section>
  );
}
