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
