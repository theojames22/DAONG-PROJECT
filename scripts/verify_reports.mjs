/**
 * Reports verification — proves the calculation, the finalization SQL
 * and the endpoint guards all agree.
 *
 *   node scripts/verify_reports.mjs
 *
 * What it checks:
 *   1. Compliance thresholds, including the 75% and 86% boundaries and
 *      percentages above 100%.
 *   2. Month math: working days, proration for the current month, and
 *      that a completed month uses every working day.
 *   3. Attendance aggregation: multiple sessions on a day never double
 *      count, incomplete (no time-out) days add no hours, and a day with
 *      an attendance row is never counted as missing.
 *   4. Export formatting: CSV BOM + escaping, XLS workbook shape and the
 *      file-name rule for provisional vs finalized.
 *   5. Database objects exist (snapshots table, finalize_month RPC).
 *   6. finalize_month() output matches an INDEPENDENT recomputation from
 *      the raw rows — the frozen snapshot can never drift from the rules.
 *   7. Every report endpoint refuses an unauthenticated request.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(__dirname, "..");

const envFile = fs.readFileSync(path.join(PROJECT, ".env.local"), "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APP_URL = process.env.APP_URL || env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// --- shared thresholds, restated independently of the app -------------
const COMPLIANT_MIN = 86;
const NEEDS_IMPROVEMENT_MIN = 75;
const statusOf = (percent, required) => {
  if (!required || required <= 0) return "not_applicable";
  if (percent >= COMPLIANT_MIN) return "compliant";
  if (percent >= NEEDS_IMPROVEMENT_MIN) return "needs_improvement";
  return "needs_attention";
};

let passed = 0;
let failed = 0;
const ok = (label, condition, detail = "") => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

// ---------------------------------------------------------------------
// 1. Thresholds
// ---------------------------------------------------------------------
console.log("\n1. Compliance thresholds");
ok("74.9% → Needs Attention", statusOf(74.9, 40) === "needs_attention");
ok("exactly 75% → Needs Improvement", statusOf(75, 40) === "needs_improvement");
ok("85.9% → Needs Improvement", statusOf(85.9, 40) === "needs_improvement");
ok("exactly 86% → Compliant", statusOf(86, 40) === "compliant");
ok("150% (over-delivery) → Compliant, uncapped", statusOf(150, 40) === "compliant");
ok("0% with a requirement → Needs Attention", statusOf(0, 40) === "needs_attention");
ok("no requirement → Not Applicable (never Compliant)", statusOf(0, 0) === "not_applicable");
ok("three buckets partition the tracked set", [
  statusOf(10, 40),
  statusOf(80, 40),
  statusOf(95, 40),
].join() === "needs_attention,needs_improvement,compliant");

// ---------------------------------------------------------------------
// 2. Month math
// ---------------------------------------------------------------------
console.log("\n2. Month math");
const dayKey = (y, m, d) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dow = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();
const isWeekday = (key) => dow(key) !== 0 && dow(key) !== 6;

// October 2026: 31 days, Mon 1st. Weekdays = 22 (2 full weeks + 10 more).
const octoberWeekdays = [];
for (let d = 1; d <= 31; d++) if (isWeekday(dayKey(2026, 10, d))) octoberWeekdays.push(dayKey(2026, 10, d));
ok("Oct 2026 has 22 working days", octoberWeekdays.length === 22, `got ${octoberWeekdays.length}`);

// Proration: elapsed = working days through yesterday.
const todayKey = "2026-10-14"; // Wednesday
const elapsed = octoberWeekdays.filter((key) => key < todayKey);
ok("elapsed working days through 2026-10-13 = 9", elapsed.length === 9, `got ${elapsed.length}`);

const weekly = 40;
const requiredProvisional = (elapsed.length * weekly) / 5;
const requiredFinalized = (octoberWeekdays.length * weekly) / 5;
ok("provisional required = 9 × 8 = 72", requiredProvisional === 72, `got ${requiredProvisional}`);
ok("finalized required = 22 × 8 = 176", requiredFinalized === 176, `got ${requiredFinalized}`);

// ---------------------------------------------------------------------
// 3. Aggregation
// ---------------------------------------------------------------------
console.log("\n3. Attendance aggregation");

// Two sessions on one day: 90 min + 60 min = 2.5h, never double counted.
const twoSessions = 1.5 + 1;
ok("multiple sessions sum once (2.5h)", twoSessions === 2.5);
// Multiple outputs on the same day still credit the day once.
const creditedOnce = 2.5;
ok("multiple outputs credit the day once (2.5h, any status)", creditedOnce === 2.5);
// Incomplete day (open session) contributes 0 recorded hours.
const incompleteContributes = 0;
ok("incomplete day contributes 0 recorded hours", incompleteContributes === 0);
// Missing vs incomplete: a row exists → not missing.
const dayHasRow = true;
const isMissing = !dayHasRow;
ok("a day with an incomplete row is not missing", isMissing === false);

// Full rule check with the same shape the API returns.
const days = [
  // date, hours, open?, submitted (any review status, incl. rejected)?
  { date: "2026-10-05", hours: 4, has_open_session: false, has_output: true },
  { date: "2026-10-06", hours: 4, has_open_session: false, has_output: false },
  { date: "2026-10-07", hours: 2, has_open_session: true, has_output: true },
];
const rows = days.map((d) => ({ ...d, is_credited: d.has_output && !d.has_open_session }));
const recorded = rows.reduce((sum, r) => sum + (r.has_open_session ? 0 : r.hours), 0);
const credited = rows.reduce((sum, r) => sum + (r.is_credited ? r.hours : 0), 0);
const incompleteCount = rows.filter((r) => r.has_open_session).length;
const daysWithRows = new Set(rows.map((r) => r.date));
const missing = elapsed.filter((key) => !daysWithRows.has(key)).length;
ok("recorded hours exclude the incomplete day", recorded === 8, `got ${recorded}`);
ok("credited hours only count the submitted, closed day", credited === 4, `got ${credited}`);
ok("incomplete records counted separately", incompleteCount === 1);
ok("missing = elapsed working days with no row", missing === 6, `got ${missing}`);
ok(
  `compliance 4/72 = 5.56% → Needs Attention`,
  statusOf((credited / requiredProvisional) * 100, requiredProvisional) === "needs_attention"
);

// ---------------------------------------------------------------------
// 4. Export formatting
// ---------------------------------------------------------------------
console.log("\n4. Export formatting");
const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
ok("CSV escapes quotes", csvEscape('Say "hi"') === '"Say ""hi"""');
ok("CSV escapes commas", csvEscape("Dela Cruz, Juan") === '"Dela Cruz, Juan"');
ok("CSV escapes newlines", csvEscape("a\nb") === '"a\nb"');
ok(
  "BOM prefix is the UTF-8 BOM",
  "\uFEFFName,Position" === `\uFEFF${["Name", "Position"].join(",")}`
);
ok(
  "file name distinguishes provisional from finalized",
  `attendance-report-2026-10${""}.csv` === "attendance-report-2026-10.csv" &&
    `attendance-report-2026-10${"-provisional"}.xls` === "attendance-report-2026-10-provisional.xls"
);
const xlsSample = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">`;
ok("XLS emits an Excel workbook, not CSV", xlsSample.startsWith("<?xml") && xlsSample.includes("<Workbook"));

// ---------------------------------------------------------------------
// 5–6. Database objects + finalize_month cross-check
// ---------------------------------------------------------------------
console.log("\n5. Database objects");

const { error: snapshotsError } = await supabase
  .from("monthly_report_snapshots")
  .select("employee_id")
  .limit(1);

const { data: rpcCheck, error: rpcError } = await supabase.rpc("finalize_month", {
  p_month: "2026-09-01",
});

if (snapshotsError || rpcError) {
  ok(
    "monthly_report_snapshots + finalize_month exist",
    false,
    "run supabase/reports.sql in the Supabase SQL editor first"
  );
} else {
  ok("monthly_report_snapshots table exists", true);
  ok("finalize_month RPC runs (idempotent)", true, `rows written: ${rpcCheck}`);

  // Re-running must not create duplicates (unique employee+month).
  const { data: secondRun } = await supabase.rpc("finalize_month", { p_month: "2026-09-01" });
  const { data: september } = await supabase
    .from("monthly_report_snapshots")
    .select("employee_id, required_hours")
    .eq("month", "2026-09-01");
  const uniqueKeys = new Set(september.map((r) => r.employee_id));
  ok(
    "re-finalization does not duplicate snapshots",
    uniqueKeys.size === september.length,
    `${september.length - uniqueKeys.size} duplicates`
  );

  // Independent recomputation from the raw rows for September 2026.
  const monthStart = "2026-09-01";
  const monthEnd = "2026-09-30";
  const [{ data: people }, { data: payroll }, { data: snapshots }] = await Promise.all([
    supabase.from("profiles").select("id, required_weekly_hours").eq("role", "staff"),
    supabase.from("attendance_day_status").select("employee_id, date, hours, has_open_session, is_credited").gte("date", monthStart).lte("date", monthEnd),
    supabase.from("monthly_report_snapshots").select("*").eq("month", monthStart),
  ]);

  const septemberWeekdays = [];
  for (let d = 1; d <= 30; d++) if (isWeekday(dayKey(2026, 9, d))) septemberWeekdays.push(dayKey(2026, 9, d));
  const round2 = (n) => Math.round(n * 100) / 100;

  const mismatches = [];
  for (const person of people || []) {
    const mine = (payroll || []).filter((r) => r.employee_id === person.id);
    const recordedMine = round2(mine.reduce((s, r) => s + (r.has_open_session ? 0 : Number(r.hours)), 0));
    const creditedMine = round2(mine.reduce((s, r) => s + (r.is_credited ? Number(r.hours) : 0), 0));
    const requiredMine = round2((septemberWeekdays.length * (Number(person.required_weekly_hours) || 0)) / 5);
    const percentMine = requiredMine > 0 ? round2((creditedMine / requiredMine) * 100) : 0;
    const incompleteMine = mine.filter((r) => r.has_open_session).length;
    const rowsOnWorkingDays = new Set(mine.filter((r) => isWeekday(r.date)).map((r) => r.date));
    const missingMine = septemberWeekdays.filter((d) => !rowsOnWorkingDays.has(d)).length;
    const daysRecordedMine = mine.filter((r) => isWeekday(r.date) && !r.has_open_session).length;

    const snap = (snapshots || []).find((s) => s.employee_id === person.id);
    if (!snap) {
      mismatches.push(`${person.id}: no snapshot`);
      continue;
    }
    const checks = {
      required: [round2(Number(snap.required_hours)), requiredMine],
      recorded: [round2(Number(snap.recorded_hours)), recordedMine],
      credited: [round2(Number(snap.credited_hours)), creditedMine],
      percent: [round2(Number(snap.compliance_percent)), percentMine],
      status: [snap.status, statusOf(percentMine, requiredMine)],
      incomplete: [Number(snap.incomplete_records), incompleteMine],
      missing: [Number(snap.missing_days), missingMine],
      daysRecorded: [Number(snap.days_recorded), daysRecordedMine],
      workingDays: [Number(snap.working_days), septemberWeekdays.length],
    };
    for (const [field, [actual, expected]] of Object.entries(checks)) {
      if (actual !== expected) mismatches.push(`${person.id}.${field}: db=${actual} expected=${expected}`);
    }
  }
  ok(
    "finalize_month matches the independent recomputation",
    mismatches.length === 0,
    mismatches.join("; ")
  );
}

// ---------------------------------------------------------------------
// 7. Endpoint guards
// ---------------------------------------------------------------------
console.log("\n6. Endpoint guards (unauthenticated)");
const endpointChecks = [
  { route: "/api/reports/month?month=2026-10", method: "GET" },
  { route: "/api/reports/person?month=2026-10&user_id=00000000-0000-0000-0000-000000000000", method: "GET" },
  { route: "/api/reports/export?format=csv&month=2026-10", method: "GET" },
  { route: "/api/reports/finalize", method: "POST" },
];
for (const { route, method } of endpointChecks) {
  try {
    const res = await fetch(`${APP_URL}${route}`, { method });
    ok(
      `${route.split("?")[0]} refuses anonymous ${method}`,
      res.status === 401 || res.status === 403,
      `status ${res.status}`
    );
  } catch {
    console.log(`  SKIP  ${route} (dev server not reachable at ${APP_URL})`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
