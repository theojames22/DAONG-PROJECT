import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthWindow } from "@/lib/attendance";
import { addDaysToKey, dateKeyIn, dayOfWeek, isValidDateKey } from "@/lib/time";
import { getAppTimezone } from "@/lib/report/queries";
import { Availability } from "@/lib/types";

/**
 * Availability / schedule API — the single source of truth is the
 * `availability` table in Supabase (see supabase/schedule_management.sql).
 *
 * A person manages only their own rows: every write filters on
 * `employee_id = auth.uid()`, so a forged id in the request body can
 * only ever touch the caller's schedule. Heads read everyone's
 * rows through the separate /api/head/availability route.
 */

const OVERLAP_MESSAGE =
  "You already have an availability schedule that overlaps with this time.";
const DUPLICATE_MESSAGE = "This schedule already exists.";

interface ExistingRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Half-open overlap: back-to-back periods are NOT a conflict. */
function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);
}

function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/** All `valid` dates a recurring request expands to. */
function expandRecurrence(
  fromDate: string,
  untilDate: string,
  weekdays: number[]
): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  // Guard against runaway loops.
  const hardLimit = 400;
  while (cursor <= untilDate && dates.length < hardLimit) {
    if (weekdays.includes(dayOfWeek(cursor))) {
      dates.push(cursor);
    }
    cursor = addDaysToKey(cursor, 1);
  }
  return dates;
}

async function ownRowsForDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
  ignoreId?: string
): Promise<ExistingRow[]> {
  let query = supabase
    .from("availability")
    .select("id, date, start_time, end_time, status")
    .eq("employee_id", userId)
    .eq("date", date);

  if (ignoreId) query = query.neq("id", ignoreId);

  const { data } = await query;
  return (data ?? []) as ExistingRow[];
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // "YYYY-MM"

  let query = supabase
    .from("availability")
    .select("*")
    .eq("employee_id", user.id)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const { start, endExclusive } = monthWindow(monthParam);
    query = query.gte("date", start).lt("date", endExclusive);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      {
        error:
          "The availability table is missing. Run supabase/schedule_management.sql in your Supabase SQL editor.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ data: (data ?? []) as Availability[] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    date,
    start_time: startTime,
    end_time: endTime,
    notes,
    status,
    recurrence,
  } = body;

  // ---- Field validation --------------------------------------------
  if (
    typeof date !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    !isValidDateKey(date) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)
  ) {
    return NextResponse.json(
      { error: "A valid date, start time, and end time are required." },
      { status: 400 }
    );
  }

  const rowStatus: "available" | "unavailable" =
    status === "unavailable" ? "unavailable" : "available";

  if (toMinutes(endTime) <= toMinutes(startTime)) {
    return NextResponse.json(
      { error: "The end time must be later than the start time." },
      { status: 400 }
    );
  }

  const timezone = await getAppTimezone(supabase);
  const todayKey = dateKeyIn(timezone);
  if (date < todayKey) {
    return NextResponse.json(
      { error: "You cannot set availability for a past date." },
      { status: 400 }
    );
  }

  // ---- Recurring (repeat weekly) or single entry ---------------------
  const wantsRecurrence =
    recurrence &&
    Array.isArray(recurrence.weekdays) &&
    recurrence.weekdays.length > 0 &&
    recurrence.until;

  let datesToWrite: string[] = [date];

  if (wantsRecurrence) {
    const until: string = String(recurrence.until);
    if (typeof until !== "string" || !isValidDateKey(until) || until < date) {
      return NextResponse.json(
        { error: "Pick an end date on or after the start date." },
        { status: 400 }
      );
    }
    const weekdays: number[] = recurrence.weekdays
      .map((d: unknown) => Number(d))
      .filter((d: number) => d >= 0 && d <= 6);
    if (weekdays.length === 0) {
      return NextResponse.json(
        { error: "Select at least one weekday to repeat on." },
        { status: 400 }
      );
    }
    datesToWrite = expandRecurrence(date, until, weekdays);
  }

  const seriesId = wantsRecurrence ? crypto.randomUUID() : null;
  const noteValue = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  // ---- Per-date conflict validation ---------------------------------
  // Duplicate = the exact same period already exists.
  // Overlap = any intersecting period (back-to-back is fine).
  const insertable: string[] = [];
  const skipped: { date: string; message: string }[] = [];
  const seen = new Set<string>();

  for (const targetDate of datesToWrite) {
    const key = `${targetDate}|${startTime}|${endTime}`;
    if (seen.has(key)) {
      skipped.push({ date: targetDate, message: DUPLICATE_MESSAGE });
      continue;
    }
    seen.add(key);

    const existing = await ownRowsForDate(supabase, user.id, targetDate);
    const exact = existing.find(
      (row) =>
        row.start_time === normalizeTime(startTime) &&
        row.end_time === normalizeTime(endTime)
    );
    if (exact) {
      skipped.push({ date: targetDate, message: DUPLICATE_MESSAGE });
      continue;
    }
    const clash = existing.find((row) =>
      overlaps(startTime, endTime, row.start_time, row.end_time)
    );
    if (clash) {
      skipped.push({ date: targetDate, message: OVERLAP_MESSAGE });
      continue;
    }
    insertable.push(targetDate);
  }

  if (insertable.length === 0) {
    return NextResponse.json(
      {
        error: skipped[0]?.message ?? OVERLAP_MESSAGE,
        skipped,
      },
      { status: 409 }
    );
  }

  // ---- Insert (all dates of a series in one round trip) --------------
  const { data: inserted, error } = await supabase
    .from("availability")
    .insert(
      insertable.map((targetDate) => ({
        employee_id: user.id,
        date: targetDate,
        start_time: normalizeTime(startTime),
        end_time: normalizeTime(endTime),
        notes: noteValue,
        status: rowStatus,
        series_id: seriesId,
      }))
    )
    .select();

  if (error) {
    // 23P01 = the exclusion constraint blocked a simultaneous insert.
    if (error.code === "23P01") {
      return NextResponse.json({ error: OVERLAP_MESSAGE }, { status: 409 });
    }
    console.error("[availability] insert failed:", error.message);
    return NextResponse.json(
      { error: "Failed to save availability. Try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: (inserted ?? []) as Availability[],
    skipped,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { id, date, start_time: startTime, end_time: endTime, notes, status } =
    body ?? {};

  if (
    typeof id !== "string" ||
    typeof date !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    !isValidDateKey(date) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)
  ) {
    return NextResponse.json(
      { error: "A valid ID, date, start time, and end time are required." },
      { status: 400 }
    );
  }

  const timezone = await getAppTimezone(supabase);
  const todayKey = dateKeyIn(timezone);
  if (date < todayKey) {
    return NextResponse.json(
      { error: "You cannot set availability for a past date." },
      { status: 400 }
    );
  }

  if (toMinutes(endTime) <= toMinutes(startTime)) {
    return NextResponse.json(
      { error: "The end time must be later than the start time." },
      { status: 400 }
    );
  }

  // The row being edited is excluded from its own conflict check.
  const existing = await ownRowsForDate(supabase, user.id, date, id);

  const exact = existing.find(
    (row) =>
      row.start_time === normalizeTime(startTime) &&
      row.end_time === normalizeTime(endTime)
  );
  if (exact) {
    return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
  }

  const clash = existing.find((row) =>
    overlaps(startTime, endTime, row.start_time, row.end_time)
  );
  if (clash) {
    return NextResponse.json({ error: OVERLAP_MESSAGE }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from("availability")
    .update({
      date,
      start_time: normalizeTime(startTime),
      end_time: normalizeTime(endTime),
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      status: status === "unavailable" ? "unavailable" : "available",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    // Ownership: only the caller's own row can ever match.
    .eq("employee_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json({ error: OVERLAP_MESSAGE }, { status: 409 });
    }
    console.error("[availability] update failed:", error.message);
    return NextResponse.json(
      { error: "Failed to update availability. Try again." },
      { status: 400 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Availability not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: updated as Availability });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const seriesId = searchParams.get("series_id");

  if (!id && !seriesId) {
    return NextResponse.json(
      { error: "An availability id or series id is required." },
      { status: 400 }
    );
  }

  // Ownership is enforced in the query itself — the caller can only
  // ever delete rows they own.
  let query = supabase
    .from("availability")
    .delete()
    .eq("employee_id", user.id);

  if (seriesId) query = query.eq("series_id", seriesId);
  if (id) query = query.eq("id", id);

  const { error } = await query;

  if (error) {
    console.error("[availability] delete failed:", error.message);
    return NextResponse.json(
      { error: "Failed to delete availability. Try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
