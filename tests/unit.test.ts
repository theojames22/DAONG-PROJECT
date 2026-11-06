import assert from "node:assert/strict";
import test from "node:test";

import {
  addDaysToKey,
  dateKeyIn,
  dayEndISO,
  dayStartISO,
  isValidDateKey,
  weekRangeForKey,
  zonedDateTimeToUtc,
} from "../lib/time";
import { isSafeStoragePath, storagePathFromUrl } from "../lib/storage";
import {
  isInlineImageMime,
  isSafeHttpUrl,
  safeContentType,
  validateSubmission,
} from "../lib/outputs";
import { csvEscape } from "../lib/report/export";
import {
  authErrorStatus,
  isMissingSessionError,
  isValidEmail,
  normalizeEmail,
  passwordUpdateMessage,
  resetRequestMessage,
  validateNewPassword,
} from "../lib/auth/reset";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  applyPreset,
  appearanceToCssVars,
  cloneAppearance,
  contrastRatio,
  getContrastReport,
  inferPreset,
  normalizeHex,
  palettesEqual,
  parseAppearancePreferences,
  pickLabelOn,
  pickReadableForeground,
  resolveAppearance,
  sanitizeAppearancePreferences,
  validateAppearancePreferences,
} from "../lib/appearance";
import { rankByCompletion, type LeaderboardCandidate } from "../lib/leaderboard";
import {
  creditedPercent,
  creditedProgress,
  formatPercentValue,
  requiredHoursInfo,
  requiredHoursLabel,
  requiredHoursTarget,
} from "../lib/attendance";
import {
  availablePeopleForDate,
  groupAvailabilityByDate,
  isAvailableRow,
  personDayStatus,
  rowsForPersonOnDate,
  type SchedulePerson,
} from "../lib/availability";
import type { AvailabilityWithProfile } from "../lib/types";

test("dateKeyIn uses the app timezone, not the host timezone", () => {
  // 16:30 UTC is already the next calendar day in Manila.
  assert.equal(
    dateKeyIn("Asia/Manila", new Date("2026-10-28T16:30:00.000Z")),
    "2026-10-29"
  );
  assert.equal(
    dateKeyIn("Asia/Manila", new Date("2026-10-28T15:59:59.999Z")),
    "2026-10-28"
  );
});

test("day bounds are correct UTC instants for Manila", () => {
  assert.equal(
    dayStartISO("2026-10-28", "Asia/Manila"),
    "2026-10-27T16:00:00.000Z"
  );
  assert.equal(
    dayEndISO("2026-10-28", "Asia/Manila"),
    "2026-10-28T15:59:59.999Z"
  );
});

test("weekRangeForKey starts on Monday and spans seven date keys", () => {
  const week = weekRangeForKey("2026-10-28");
  assert.equal(week.start, "2026-10-26");
  assert.equal(week.end, "2026-11-01");
  assert.equal(week.days.length, 7);
  assert.equal(week.days[0], "2026-10-26");
  assert.equal(week.days[6], "2026-11-01");
});

test("date-key arithmetic crosses month and year boundaries", () => {
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysToKey("2028-03-01", -1), "2028-02-29");
});

test("zonedDateTimeToUtc handles daylight-saving offsets", () => {
  assert.equal(
    zonedDateTimeToUtc("America/New_York", "2026-07-01").toISOString(),
    "2026-07-01T04:00:00.000Z"
  );
  assert.equal(
    zonedDateTimeToUtc("America/New_York", "2026-01-15").toISOString(),
    "2026-01-15T05:00:00.000Z"
  );
});

test("date-key validation rejects impossible calendar dates", () => {
  assert.equal(isValidDateKey("2026-02-28"), true);
  assert.equal(isValidDateKey("2028-02-29"), true);
  assert.equal(isValidDateKey("2026-02-29"), false);
  assert.equal(isValidDateKey("2026-13-01"), false);
  assert.equal(isValidDateKey("not-a-date"), false);
});

test("storagePathFromUrl accepts only this project's object paths", () => {
  assert.equal(
    storagePathFromUrl(
      "https://example.supabase.co/storage/v1/object/public/project-files/user-1/deliverables/a%20b.png"
    ),
    "user-1/deliverables/a b.png"
  );
  assert.equal(
    storagePathFromUrl(
      "https://example.supabase.co/storage/v1/object/sign/project-files/user-1/file.pdf?token=x"
    ),
    "user-1/file.pdf"
  );
  assert.equal(
    storagePathFromUrl(
      "https://example.supabase.co/storage/v1/object/public/avatars/user-1/a.png"
    ),
    null
  );
  assert.equal(
    storagePathFromUrl(
      "https://example.supabase.co/storage/v1/object/public/project-files/../secrets.txt"
    ),
    null
  );
  assert.equal(storagePathFromUrl("https://example.com/project-files/a.png"), null);
});

test("storage paths reject traversal and absolute keys", () => {
  assert.equal(isSafeStoragePath("user-1/deliverables/a b.png"), true);
  assert.equal(isSafeStoragePath("user-1/../other/a.png"), false);
  assert.equal(isSafeStoragePath("user-1/./a.png"), false);
  assert.equal(isSafeStoragePath("/user-1/a.png"), false);
  assert.equal(isSafeStoragePath("user-1\\a.png"), false);
  assert.equal(isSafeStoragePath("user-1//a.png"), false);
  assert.equal(isSafeStoragePath(""), false);
  assert.equal(isSafeStoragePath(null), false);
});

test("link validation accepts only http(s)", () => {
  assert.equal(isSafeHttpUrl("https://example.com/a"), true);
  assert.equal(isSafeHttpUrl("http://example.com/a"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,hello"), false);
});

test("submission validation enforces server-side limits", () => {
  assert.equal(
    validateSubmission({
      type: "written",
      title: "Weekly report",
      content: "hello",
      link: "",
      notes: "",
      file: null,
    }),
    null
  );

  assert.match(
    validateSubmission({
      type: "written",
      title: "",
      content: "hello",
      link: "",
      notes: "",
      file: null,
    }) ?? "",
    /name|title/i
  );

  assert.match(
    validateSubmission({
      type: "link",
      title: "A link",
      content: "",
      link: "javascript:alert(1)",
      notes: "",
      file: null,
    }) ?? "",
    /link/i
  );
});

test("file responses never echo executable MIME types", () => {
  assert.equal(safeContentType("image/png"), "image/png");
  assert.equal(safeContentType("application/pdf"), "application/pdf");
  assert.equal(safeContentType("text/html"), "application/octet-stream");
  assert.equal(safeContentType("image/svg+xml"), "application/octet-stream");
  assert.equal(safeContentType(null), "application/octet-stream");

  assert.equal(isInlineImageMime("image/png"), true);
  assert.equal(isInlineImageMime("image/svg+xml"), false);
  assert.equal(isInlineImageMime("text/html"), false);
});

test("CSV export neutralises spreadsheet formulas", () => {
  assert.equal(csvEscape("Normal name"), "Normal name");
  assert.equal(csvEscape('=HYPERLINK("https://evil")'), `"'=HYPERLINK(""https://evil"")"`);
  assert.equal(csvEscape("+1+1"), "'+1+1");
  assert.equal(csvEscape("@SUM(A1:A2)"), "'@SUM(A1:A2)");
});

test("reset email validation trims and rejects malformed addresses", () => {
  assert.equal(normalizeEmail("  staff@daong.ph  "), "staff@daong.ph");
  assert.equal(isValidEmail("  staff@daong.ph  "), true);
  assert.equal(isValidEmail("staff@daong"), false);
  assert.equal(isValidEmail("staff daong.ph"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("@daong.ph"), false);
});

test("reset password policy matches the existing rule and never weakens it", () => {
  assert.match(validateNewPassword("short1") ?? "", /8 characters/);
  assert.equal(
    validateNewPassword(`${"a".repeat(71)}12`),
    "Password must be 72 characters or fewer."
  );
  assert.equal(
    validateNewPassword("12345678"),
    "Password must include at least one letter."
  );
  assert.equal(
    validateNewPassword("abcdefgh"),
    "Password must include at least one number."
  );
  assert.equal(validateNewPassword("sailboat7"), null);
});

test("auth errors are classified without leaking provider messages", () => {
  assert.equal(authErrorStatus({ status: 429 }), 429);
  assert.equal(authErrorStatus({ status: "429" }), undefined);

  assert.match(resetRequestMessage({ status: 429 }), /too many/i);
  assert.match(
    resetRequestMessage({ name: "AuthRetryableFetchError", status: 0 }),
    /connection/i
  );
  assert.equal(
    resetRequestMessage({ message: "some internal provider detail" }),
    "We couldn't process that request right now. Please try again."
  );

  assert.equal(
    isMissingSessionError({ name: "AuthSessionMissingError", status: 400 }),
    true
  );
  assert.equal(isMissingSessionError({ status: 401 }), true);
  assert.equal(isMissingSessionError({ status: 403 }), true);
  assert.equal(isMissingSessionError({ code: "refresh_token_not_found" }), true);
  assert.equal(isMissingSessionError({ code: "bad_jwt", status: 403 }), true);
  assert.equal(isMissingSessionError({ status: 400 }), false);

  assert.match(
    passwordUpdateMessage({ code: "same_password" }),
    /haven't used before/i
  );
  assert.match(passwordUpdateMessage({ code: "weak_password" }), /8–72/);
  assert.equal(
    passwordUpdateMessage({ message: "raw backend error" }),
    "We couldn't update your password. Please try again."
  );
});

// ---------------------------------------------------------------------------
// Appearance / theme engine
// ---------------------------------------------------------------------------

test("HEX values are normalised and validated", () => {
  assert.equal(normalizeHex("#2563eb"), "#2563EB");
  assert.equal(normalizeHex("2563EB"), "#2563EB");
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex(" #0f0 "), "#00FF00");
  assert.equal(normalizeHex("#abcd"), null);
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex("rebeccapurple"), null);
  assert.equal(normalizeHex(null), null);
  assert.equal(normalizeHex(123), null);
});

test("WCAG contrast ratios match the published reference points", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(contrastRatio("#FFFFFF", "#000000"), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  // 4.5:1 is the AA floor for normal text.
  assert.ok(contrastRatio("#2563EB", "#FFFFFF") >= 4.5);
});

test("pickReadableForeground keeps passing colors and fixes failing ones", () => {
  assert.equal(pickReadableForeground("#172033", "#FFFFFF", 4.5), "#172033");

  const fixed = pickReadableForeground("#E5E7EB", "#FFFFFF", 4.5);
  assert.ok(contrastRatio(fixed, "#FFFFFF") >= 4.5);

  const labelOnLight = pickLabelOn("#FFFFFF");
  assert.ok(contrastRatio(labelOnLight, "#FFFFFF") >= 4.5);
  const labelOnDark = pickLabelOn("#0F172A");
  assert.ok(contrastRatio(labelOnDark, "#0F172A") >= 4.5);
});

test("malformed appearance JSON never breaks rendering", () => {
  for (const raw of [null, undefined, "not json", "{", 42, [], { mode: "neon" }]) {
    const prefs = sanitizeAppearancePreferences(raw);
    assert.equal(prefs.version, 1);
    assert.ok(["light", "dark", "system"].includes(prefs.mode));
    assert.equal(prefs.light.colors.primary, DEFAULT_LIGHT_COLORS.primary);
    assert.equal(prefs.dark.colors.primary, DEFAULT_DARK_COLORS.primary);
  }
});

test("sanitising accepts a partial palette and falls back per key", () => {
  const prefs = sanitizeAppearancePreferences({
    mode: "dark",
    light: { colors: { primary: "#123456", mainText: "nope" } },
  });

  assert.equal(prefs.mode, "dark");
  assert.equal(prefs.light.colors.primary, "#123456");
  assert.equal(prefs.light.colors.mainText, DEFAULT_LIGHT_COLORS.mainText);
  assert.equal(prefs.light.preset, "custom");
  assert.equal(prefs.dark.colors.primary, DEFAULT_DARK_COLORS.primary);
});

test("legacy theme_preference is used when JSON has no mode", () => {
  assert.equal(
    sanitizeAppearancePreferences(null, "system").mode,
    "system"
  );
  assert.equal(
    sanitizeAppearancePreferences({ mode: "dark" }, "light").mode,
    "dark"
  );
});

test("strict write parsing reports invalid colors instead of saving them", () => {
  const { preferences, invalidColors } = parseAppearancePreferences({
    light: { colors: { primary: "#123456", border: "blue" } },
    dark: { colors: { danger: "#zzzzzz" } },
  });

  assert.deepEqual(invalidColors.sort(), ["dark.danger", "light.border"]);
  assert.equal(preferences.light.colors.primary, "#123456");
  assert.equal(preferences.light.colors.border, DEFAULT_LIGHT_COLORS.border);
});

test("presets are detected only while every colour matches", () => {
  assert.equal(inferPreset(DEFAULT_LIGHT_COLORS, "light"), "daong-blue");
  assert.equal(inferPreset(DEFAULT_DARK_COLORS, "dark"), "daong-blue");

  const edited = { ...DEFAULT_LIGHT_COLORS, primary: "#FF0000" };
  assert.equal(inferPreset(edited, "light"), "custom");
  assert.equal(
    sanitizeAppearancePreferences({
      light: { preset: "daong-blue", colors: edited },
    }).light.preset,
    "custom"
  );
});

test("applying a preset to one mode leaves the other palette untouched", () => {
  const before = cloneAppearance(DEFAULT_APPEARANCE);
  const after = applyPreset(before, "light", "emerald");

  assert.equal(after.light.preset, "emerald");
  assert.notEqual(after.light.colors.primary, before.light.colors.primary);
  assert.deepEqual(after.dark, before.dark);
  assert.equal(before.light.preset, "daong-blue");
});

test("auto-adjust derives readable text without overwriting swatches", () => {
  const prefs = cloneAppearance(DEFAULT_APPEARANCE);
  prefs.light.colors.mainText = "#FFFFFF"; // unreadable on the white page
  prefs.options.autoAdjustText = true;

  const resolved = resolveAppearance(prefs, "light");
  assert.equal(
    contrastRatio(resolved.tokens["--text-on-background"], "#FFFFFF") >= 4.5,
    true
  );
  assert.equal(prefs.light.colors.mainText, "#FFFFFF");
  assert.ok(resolved.adjustments.some((item) => item.key === "mainText"));
});

test("validation blocks unreadable text only when auto-adjust is off", () => {
  const prefs = cloneAppearance(DEFAULT_APPEARANCE);
  prefs.light.colors.mainText = "#FFFFFF";
  prefs.light.colors.pageBackground = "#FFFFFF";

  prefs.options.autoAdjustText = false;
  const blocked = validateAppearancePreferences(prefs);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blocking.some((item) => item.mode === "light"));

  prefs.options.autoAdjustText = true;
  const allowed = validateAppearancePreferences(prefs);
  assert.equal(allowed.ok, true);
});

test("contrast reports cover both independent palettes", () => {
  const prefs = cloneAppearance(DEFAULT_APPEARANCE);
  prefs.dark.colors.pageBackground = "#FFFFFF";
  prefs.dark.colors.mainText = "#FFFFFF";
  prefs.options.autoAdjustText = false;

  const lightReport = getContrastReport(prefs, "light");
  const darkReport = getContrastReport(prefs, "dark");

  // The dark palette is deliberately unreadable here; the untouched light
  // palette must not inherit that problem.
  assert.ok(darkReport.blocking.length > lightReport.blocking.length);
  assert.ok(
    darkReport.blocking.some((item) => item.id === "main-on-page")
  );
  assert.ok(lightReport.blocking.every((item) => item.id !== "main-on-page"));
});

test("resolved tokens expose the selected palette and derived roles", () => {
  const prefs = cloneAppearance(DEFAULT_APPEARANCE);
  prefs.light.colors.primary = "#7C3AED";
  prefs.light.colors.cardBackground = "#FDF4FF";

  const vars = appearanceToCssVars(prefs, "light");
  assert.equal(vars["--primary"], "#7C3AED");
  assert.equal(vars["--card-bg"], "#FDF4FF");
  assert.equal(vars["--page-bg"], prefs.light.colors.pageBackground);
  assert.ok(vars["--on-primary"]);
  assert.ok(vars["--text-on-card"]);
  assert.ok(vars["--radius-card"]);
  assert.ok(vars["--density-row-y"]);
});

test("palette equality is case-insensitive", () => {
  assert.equal(
    palettesEqual(DEFAULT_LIGHT_COLORS, {
      ...DEFAULT_LIGHT_COLORS,
      primary: DEFAULT_LIGHT_COLORS.primary.toLowerCase(),
    }),
    true
  );
});

test("required hours distinguish configured, zero, and missing values", () => {
  assert.deepEqual(requiredHoursInfo(40), { status: "configured", hours: 40 });
  assert.deepEqual(requiredHoursInfo(30), { status: "configured", hours: 30 });
  assert.deepEqual(requiredHoursInfo("30"), { status: "configured", hours: 30 });
  assert.deepEqual(requiredHoursInfo(0), { status: "not_applicable", hours: 0 });
  assert.deepEqual(requiredHoursInfo(null), {
    status: "not_configured",
    hours: null,
  });
  assert.deepEqual(requiredHoursInfo(undefined), {
    status: "not_configured",
    hours: null,
  });
  assert.deepEqual(requiredHoursInfo(Number.NaN), {
    status: "not_configured",
    hours: null,
  });

  assert.equal(requiredHoursLabel(40), "40.0h");
  assert.equal(requiredHoursLabel(0), "No required hours");
  assert.equal(requiredHoursLabel(null), "Not configured");
  assert.equal(requiredHoursTarget(0), 0);
  assert.equal(requiredHoursTarget(undefined), 0);
});

test("credited progress never invents a 40-hour target", () => {
  const zero = creditedProgress(0, 0);
  assert.equal(zero.status, "not_applicable");
  assert.equal(zero.required, 0);
  assert.equal(zero.percentMet, 0);
  assert.equal(zero.remainingHours, 0);
  assert.equal(zero.targetMet, false);

  const missing = creditedProgress(0, null);
  assert.equal(missing.status, "not_configured");
  assert.equal(missing.required, 0);
  assert.equal(missing.percentMet, 0);
  assert.equal(missing.remainingHours, 0);

  const thirty = creditedProgress(15, 30);
  assert.equal(thirty.status, "configured");
  assert.equal(thirty.required, 30);
  assert.equal(thirty.percentMet, 50);
  assert.equal(thirty.remainingHours, 15);

  const forty = creditedProgress(10, 40);
  assert.equal(forty.required, 40);
  assert.equal(forty.percentMet, 25);
  assert.equal(forty.remainingHours, 30);

  assert.equal(creditedPercent(10, 0), 0);
  assert.equal(creditedPercent(10, 40), 25);
});

function leaderboardCandidate(
  id: string,
  fullName: string,
  creditedHours: number,
  recordedHours: number,
  requiredHours: number
): LeaderboardCandidate {
  return {
    id,
    full_name: fullName,
    position: null,
    profile_picture_url: null,
    creditedHours,
    recordedHours,
    requiredHours,
  };
}

test("leaderboard ranks by each Staff member's own completion percentage", () => {
  const { ranked, notApplicable } = rankByCompletion([
    leaderboardCandidate("a", "Staff A", 40, 42, 40),
    leaderboardCandidate("b", "Staff B", 30, 31, 30),
    leaderboardCandidate("c", "Staff C", 18, 20, 20),
    leaderboardCandidate("d", "Staff D", 32, 36, 40),
  ]);

  assert.equal(notApplicable.length, 0);
  assert.deepEqual(
    ranked.map((entry) => ({
      id: entry.id,
      rank: entry.rank,
      completion: entry.completionPercent,
      actual: entry.actualPercent,
    })),
    [
      { id: "a", rank: 1, completion: 100, actual: 100 },
      { id: "b", rank: 1, completion: 100, actual: 100 },
      { id: "c", rank: 3, completion: 90, actual: 90 },
      { id: "d", rank: 4, completion: 80, actual: 80 },
    ]
  );
});

test("over-target work is capped for ranking but keeps its actual percentage", () => {
  const { ranked } = rankByCompletion([
    leaderboardCandidate("a", "Over Target", 50, 55, 40),
    leaderboardCandidate("b", "At Target", 40, 40, 40),
    leaderboardCandidate("c", "Also At Target", 30, 30, 30),
  ]);

  assert.deepEqual(
    ranked.map((entry) => entry.rank),
    [1, 1, 1]
  );

  const overTarget = ranked.find((entry) => entry.id === "a");
  assert.ok(overTarget);
  assert.equal(overTarget.completionPercent, 100);
  assert.equal(overTarget.actualPercent, 125);
  assert.equal(formatPercentValue(overTarget.actualPercent), "125%");
  assert.equal(overTarget.creditedHours, 50);
});

test("zero credited hours rank at 0% and zero required hours are excluded", () => {
  const { ranked, notApplicable } = rankByCompletion([
    leaderboardCandidate("zero", "Zero Credit", 0, 10, 40),
    leaderboardCandidate("na", "No Target", 10, 12, 0),
  ]);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, "zero");
  assert.equal(ranked[0].completionPercent, 0);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].recordedHours, 10);
  assert.deepEqual(
    notApplicable.map((entry) => entry.id),
    ["na"]
  );
});

test("equal completion shares a rank and uses alphabetical order", () => {
  const { ranked } = rankByCompletion([
    leaderboardCandidate("z", "Zed", 20, 20, 40),
    leaderboardCandidate("a", "Amy", 10, 10, 20),
    leaderboardCandidate("b", "Bob", 25, 25, 50),
    leaderboardCandidate("low", "Low", 10, 10, 40),
  ]);

  assert.deepEqual(
    ranked.map((entry) => entry.id),
    ["a", "b", "z", "low"]
  );
  assert.deepEqual(
    ranked.map((entry) => entry.rank),
    [1, 1, 1, 4]
  );
});

test("recorded hours never contribute to completion", () => {
  const { ranked } = rankByCompletion([
    leaderboardCandidate("a", "Recorded Only", 10, 50, 40),
  ]);

  assert.equal(ranked[0].creditedHours, 10);
  assert.equal(ranked[0].recordedHours, 50);
  assert.equal(ranked[0].completionPercent, 25);
});

test("floating-point-equivalent ratios stay tied", () => {
  const { ranked } = rankByCompletion([
    leaderboardCandidate("a", "One Third", 1, 1, 3),
    leaderboardCandidate("b", "Two Sixths", 2, 2, 6),
  ]);

  assert.deepEqual(
    ranked.map((entry) => entry.completionPercent),
    [33.33, 33.33]
  );
  assert.deepEqual(
    ranked.map((entry) => entry.rank),
    [1, 1]
  );
});

test("invalid hour values are normalised without breaking ranking", () => {
  const { ranked, notApplicable } = rankByCompletion([
    leaderboardCandidate("a", "Invalid Credit", Number.NaN, -10, 40),
    leaderboardCandidate("b", "Invalid Target", 10, 10, Number.NaN),
  ]);

  assert.equal(ranked[0].creditedHours, 0);
  assert.equal(ranked[0].recordedHours, 0);
  assert.equal(ranked[0].completionPercent, 0);
  assert.deepEqual(
    notApplicable.map((entry) => entry.id),
    ["b"]
  );
});

// ---------------------------------------------------------------------------
// Schedule availability filtering
// ---------------------------------------------------------------------------

function availabilityRow(
  id: string,
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  status: "available" | "unavailable" = "available"
): AvailabilityWithProfile {
  return {
    id,
    employee_id: employeeId,
    date,
    start_time: startTime,
    end_time: endTime,
    status,
  };
}

const schedulePeople: SchedulePerson[] = [
  { id: "p1", full_name: "Ana", position: "Developer" },
  { id: "p2", full_name: "Ben", position: "Designer" },
  { id: "p3", full_name: "Cara", position: "Staff" },
  { id: "p4", full_name: "Dino", position: "Staff" },
  { id: "p5", full_name: "Eve", position: "Head" },
];

test("available staff on a date are deduplicated and keep every slot", () => {
  const rows = [
    availabilityRow("r1", "p1", "2026-11-05", "14:00:00", "17:00:00"),
    availabilityRow("r2", "p1", "2026-11-05", "09:00:00", "12:00:00"),
    availabilityRow("r3", "p5", "2026-11-06", "09:00:00", "12:00:00"),
  ];

  const entries = availablePeopleForDate(
    schedulePeople,
    groupAvailabilityByDate(rows),
    "2026-11-05"
  );

  assert.deepEqual(
    entries.map((entry) => entry.person.id),
    ["p1"]
  );
  assert.equal(entries[0].rows.length, 2);
  assert.deepEqual(
    entries[0].rows.map((row) => row.start_time),
    ["09:00:00", "14:00:00"]
  );
  assert.deepEqual(
    availablePeopleForDate(
      schedulePeople,
      groupAvailabilityByDate(rows),
      "2026-11-07"
    ),
    []
  );
});

test("missing schedules and unavailable-only people are not available", () => {
  const rows = [
    availabilityRow("r1", "p1", "2026-11-05", "09:00:00", "12:00:00"),
    availabilityRow(
      "r2",
      "p2",
      "2026-11-05",
      "13:00:00",
      "17:00:00",
      "unavailable"
    ),
    availabilityRow("r3", "p3", "2026-11-05", "08:00:00", "10:00:00"),
  ];

  const entries = availablePeopleForDate(
    schedulePeople,
    groupAvailabilityByDate(rows),
    "2026-11-05"
  );

  assert.deepEqual(
    entries.map((entry) => entry.person.id),
    ["p1", "p3"]
  );
  assert.equal(
    entries.some((entry) => entry.person.id === "p2"),
    false
  );
  assert.equal(
    entries.some((entry) => entry.person.id === "p4"),
    false
  );
});

test("partial availability includes only the available periods", () => {
  const rows = [
    availabilityRow("r1", "p1", "2026-11-05", "09:00:00", "12:00:00"),
    availabilityRow(
      "r2",
      "p1",
      "2026-11-05",
      "13:00:00",
      "17:00:00",
      "unavailable"
    ),
  ];

  const entries = availablePeopleForDate(
    schedulePeople,
    groupAvailabilityByDate(rows),
    "2026-11-05"
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "partial");
  assert.equal(entries[0].rows.length, 1);
  assert.equal(entries[0].rows[0].start_time, "09:00:00");
});

test("day status distinguishes none, unavailable, partial and available", () => {
  assert.equal(personDayStatus([]), "none");
  assert.equal(
    personDayStatus([
      availabilityRow("r1", "p1", "2026-11-05", "09:00:00", "17:00:00", "unavailable"),
    ]),
    "unavailable"
  );
  assert.equal(
    personDayStatus([
      availabilityRow("r1", "p1", "2026-11-05", "09:00:00", "12:00:00"),
      availabilityRow("r2", "p1", "2026-11-05", "13:00:00", "17:00:00", "unavailable"),
    ]),
    "partial"
  );
  assert.equal(
    personDayStatus([
      availabilityRow("r1", "p1", "2026-11-05", "09:00:00", "12:00:00"),
    ]),
    "available"
  );
});

test("availability grouping sorts periods and keeps people separate", () => {
  const rows = [
    availabilityRow("r1", "p1", "2026-11-05", "14:00:00", "17:00:00"),
    availabilityRow("r2", "p2", "2026-11-05", "08:00:00", "10:00:00"),
    availabilityRow("r3", "p1", "2026-11-05", "09:00:00", "12:00:00"),
  ];
  const rowsByDate = groupAvailabilityByDate(rows);

  assert.deepEqual(
    (rowsByDate.get("2026-11-05") ?? []).map((row) => row.id),
    ["r2", "r3", "r1"]
  );
  assert.deepEqual(
    rowsForPersonOnDate(rowsByDate, "p1", "2026-11-05").map((row) => row.id),
    ["r3", "r1"]
  );
  assert.equal(isAvailableRow(rows[0]), true);
  assert.equal(
    isAvailableRow({ status: "unavailable" } as AvailabilityWithProfile),
    false
  );
});
