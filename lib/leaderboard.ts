/**
 * Weekly leaderboard ranking.
 *
 * Staff have different required weekly hours, so ranking by raw credited hours
 * is unfair: someone with a 40-hour target can outrank someone who already
 * completed a 20-hour target. The leaderboard therefore ranks by completion of
 * each person's own requirement.
 *
 * The numbers themselves always come from the authoritative
 * `employee_week_hours` view. This module only turns those already-aggregated
 * totals into a capped ranking percentage and stable ranks.
 */

export interface LeaderboardCandidate {
  id: string;
  full_name: string | null;
  position: string | null;
  profile_picture_url?: string | null;
  /** Credited hours for the week (employee_week_hours.credited_hours). */
  creditedHours: number;
  /** Actually recorded hours; shown for context and never used for ranking. */
  recordedHours: number;
  /** The Staff member's own weekly requirement. <= 0 means Not Applicable. */
  requiredHours: number;
}

export interface RankedLeaderboardEntry extends LeaderboardCandidate {
  /** Competition rank: equal completion percentages share a rank (1, 1, 3). */
  rank: number;
  /** Capped at 100 for ranking, rounded to two decimals. */
  completionPercent: number;
  /** Uncapped completion, rounded to two decimals. Shown when above 100. */
  actualPercent: number;
}

export interface RankedLeaderboard {
  ranked: RankedLeaderboardEntry[];
  notApplicable: LeaderboardCandidate[];
}

interface ScoredCandidate extends LeaderboardCandidate {
  /** Integer basis points (percent × 100) for exact tie comparisons. */
  completionKey: number;
  completionPercent: number;
  actualPercent: number;
}

function nonNegativeHours(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
}

function compareCandidates(
  a: { full_name: string | null; id: string },
  b: { full_name: string | null; id: string }
): number {
  const byName = (a.full_name || "").localeCompare(b.full_name || "", undefined, {
    sensitivity: "base",
  });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/**
 * Rank Staff by their own weekly completion percentage.
 *
 * - `requiredHours <= 0` is excluded from the ranking and returned separately.
 * - Completion is capped at 100% so exceeding a target cannot inflate rank.
 * - Equal capped percentages share the same rank and are ordered by name.
 * - `recordedHours` is carried through untouched and never affects the result.
 */
export function rankByCompletion(
  candidates: LeaderboardCandidate[]
): RankedLeaderboard {
  const scored: ScoredCandidate[] = [];
  const notApplicable: LeaderboardCandidate[] = [];

  for (const candidate of candidates) {
    const normalized: LeaderboardCandidate = {
      ...candidate,
      creditedHours: nonNegativeHours(candidate.creditedHours),
      recordedHours: nonNegativeHours(candidate.recordedHours),
      requiredHours: nonNegativeHours(candidate.requiredHours),
    };

    if (normalized.requiredHours <= 0) {
      notApplicable.push(normalized);
      continue;
    }

    // Round to two decimals FIRST, then use the same value for display,
    // sorting and tie detection. This prevents "both show 99.8% but one is
    // rank 1 and the other rank 2" inconsistencies.
    const actualKey = Math.round(
      (normalized.creditedHours / normalized.requiredHours) * 100 * 100
    );
    const completionKey = Math.min(10000, Math.max(0, actualKey));

    scored.push({
      ...normalized,
      completionKey,
      completionPercent: completionKey / 100,
      actualPercent: Math.max(0, actualKey) / 100,
    });
  }

  scored.sort(
    (a, b) => b.completionKey - a.completionKey || compareCandidates(a, b)
  );
  notApplicable.sort(compareCandidates);

  let lastKey: number | null = null;
  let lastRank = 0;

  const ranked: RankedLeaderboardEntry[] = scored.map((entry, index) => {
    const rank =
      lastKey !== null && entry.completionKey === lastKey
        ? lastRank
        : index + 1;

    lastKey = entry.completionKey;
    lastRank = rank;

    return {
      id: entry.id,
      full_name: entry.full_name,
      position: entry.position,
      profile_picture_url: entry.profile_picture_url ?? null,
      creditedHours: entry.creditedHours,
      recordedHours: entry.recordedHours,
      requiredHours: entry.requiredHours,
      rank,
      completionPercent: entry.completionPercent,
      actualPercent: entry.actualPercent,
    };
  });

  return { ranked, notApplicable };
}
