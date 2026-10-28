import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFileName } from "@/lib/file-name";
import { dateKeyIn } from "@/lib/report/calc";
import {
  classifyUploadError,
  isSafeHttpUrl,
  isUuid,
  MAX_FILE_SIZE,
  normalizeContent,
  uploadErrorCopy,
  validateSubmission,
  type SubmissionType,
} from "@/lib/outputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "project-files";

/** The seeded value of app_settings.timezone (see credited_hours.sql). */
const FALLBACK_TIMEZONE = "Asia/Manila";

/**
 * Removes an object this request just uploaded.
 *
 * There is deliberately no DELETE policy on the bucket (staff cannot erase
 * stored attachments from the browser), so the rollback uses the service
 * role for this one narrow, server-controlled path. The prefix check keeps
 * it impossible to touch anything outside the caller's own deliverables.
 */
async function removeOrphanUpload(storagePath: string, userId: string) {
  if (!storagePath.startsWith(`${userId}/deliverables/`)) return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([storagePath]);
  } catch {
    // Best effort — the database row was never written, which is the part
    // that must be true. An orphan object is harmless, a phantom row is not.
  }
}

function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { error: { code, message, ...(extra ?? {}) } },
    { status }
  );
}

/** Duck-typed: the Web File class is what multipart parsing produces. */
function asFile(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === "string") return null;
  const candidate = value as File;
  return typeof candidate.arrayBuffer === "function" &&
    typeof candidate.size === "number" &&
    typeof candidate.name === "string"
    ? candidate
    : null;
}

/**
 * Creates an output submission.
 *
 * Everything that matters is decided here, not in the browser:
 *   • the submitter is the authenticated session, never a client-supplied id
 *   • the type, title, body, URL and attachment are validated again
 *   • file bytes go to Supabase Storage first; the database row is written
 *     only after the upload succeeds, and the upload is rolled back if the
 *     row cannot be written
 *   • the client-supplied id doubles as an idempotency key, so a double
 *     click or a retried request cannot create two submissions
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return fail(401, "NOT_AUTHENTICATED", "Your session has expired. Sign in again.");
  }

  // Role is read from the database, not from the request.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return fail(403, "FORBIDDEN", "Your profile could not be found.");
  }
  if (profile.role !== "staff") {
    return fail(403, "FORBIDDEN", "Only Staff members can submit outputs.");
  }

  // Reject an oversized body before multipart parsing buffers it in memory.
  // The bucket and validation both enforce the real file-size limit; this is
  // the cheap transport-level guard. A request without Content-Length still
  // falls through to the normal per-file validation.
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_FILE_SIZE + 2 * 1024 * 1024
  ) {
    return fail(413, "FILE_TOO_LARGE", uploadErrorCopy("FILE_TOO_LARGE").message, {
      canSwitchToWritten: true,
      retryable: false,
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "VALIDATION", "The submission could not be read. Please try again.");
  }

  const id = String(form.get("id") ?? "").trim();
  const type = String(form.get("type") ?? "").trim() as SubmissionType;
  const title = String(form.get("title") ?? "");
  const rawContent = String(form.get("content") ?? "");
  const rawLink = String(form.get("link") ?? "").trim();
  const rawNotes = String(form.get("notes") ?? "");
  const file = asFile(form.get("file"));

  if (!isUuid(id)) {
    return fail(400, "VALIDATION", "Invalid submission reference. Reload the page and try again.");
  }

  const validationError = validateSubmission({
    type,
    title,
    content: rawContent,
    link: rawLink,
    notes: rawNotes,
    file: file ? { name: file.name, size: file.size, type: file.type } : null,
  });

  if (validationError) {
    return fail(400, "VALIDATION", validationError);
  }

  const cleanTitle = title.trim();
  const submissionNotes = rawNotes.trim() || null;
  const content = type === "written" ? normalizeContent(rawContent) : null;
  const link = type === "link" && isSafeHttpUrl(rawLink) ? rawLink : null;

  // Idempotency: a retried request (double click, lost response) carrying
  // the same reference resolves to the submission it already created
  // instead of uploading or inserting a second copy.
  const { data: existingRow } = await supabase
    .from("outputs")
    .select("id, employee_id")
    .eq("id", id)
    .maybeSingle();

  if (existingRow) {
    return existingRow.employee_id === user.id
      ? NextResponse.json({ id, duplicate: true }, { status: 200 })
      : fail(409, "DUPLICATE", "That submission reference is already in use.", {
          retryable: false,
        });
  }

  // The day the submission belongs to follows the app's configured
  // timezone — the same calendar the attendance views and reports use.
  // app_timezone() is security-definer, so Staff can resolve it without
  // being granted read access to app_settings.
  const { data: timezoneValue } = await supabase.rpc("app_timezone");
  const timezone =
    typeof timezoneValue === "string" && timezoneValue
      ? timezoneValue
      : FALLBACK_TIMEZONE;
  const today = dateKeyIn(timezone);

  let attachmentUrl: string | null = null;
  let storagePath: string | null = null;
  let fileName: string | null = null;
  let fileMimeType: string | null = null;
  let fileSize: number | null = null;

  // Output attachments are written with the service-role client after this
  // route has authenticated the caller and validated the body. Browser
  // Storage write policies for project-files are removed by the storage
  // migration, so a Staff member cannot overwrite an already-reviewed file
  // by calling Storage directly.
  const admin = createAdminClient();

  // -------------------------------------------------------------------
  // Upload first (file/image). Nothing is written to the database until
  // the storage provider has confirmed the object.
  // -------------------------------------------------------------------
  if (type === "file" || type === "image") {
    if (!file) {
      return fail(400, "VALIDATION", "The attachment is missing. Choose the file again.");
    }

    fileName = file.name;
    fileMimeType = file.type || null;
    fileSize = file.size;
    // Storage keys stay ASCII and URL-safe (the original filename is kept in
    // file_name for display and download); this matches the existing objects
    // written by earlier versions of the form.
    const cleanName = safeFileName(file.name, "upload").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    storagePath = `${user.id}/deliverables/${id}-${cleanName}`;

    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      return fail(502, "UPLOAD_FAILED", uploadErrorCopy("UPLOAD_FAILED").message, {
        canSwitchToWritten: true,
        retryable: true,
      });
    }

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        // The path already contains this submission's reference, so a retry
        // overwrites its own object instead of creating a second copy.
        upsert: true,
      });

    if (uploadError) {
      const code = classifyUploadError(
        uploadError.message,
        (uploadError as unknown as { status?: number | string }).status
      );
      const copy = uploadErrorCopy(code);
      const httpStatus =
        code === "FILE_TOO_LARGE"
          ? 413
          : code === "STORAGE_FULL"
            ? 507
            : code === "UNSUPPORTED_FILE"
              ? 415
              : 502;
      return fail(httpStatus, code, copy.message, {
        canSwitchToWritten: copy.canSwitchToWritten,
        retryable: true,
      });
    }

    // The bucket is private. Reads go through /api/outputs/[id]/file, which
    // checks the output row, then streams the object with the service role.
    // Never persist a public URL: it would outlive authorization changes.
    attachmentUrl = null;
  } else if (type === "link") {
    attachmentUrl = link;
  }

  // -------------------------------------------------------------------
  // Persist. Only metadata + the storage reference go in the database;
  // the file itself stays in the bucket.
  // -------------------------------------------------------------------
  const { data: inserted, error: insertError } = await admin
    .from("outputs")
    .insert({
      id,
      employee_id: user.id,
      date: today,
      title: cleanTitle,
      attachment_type: type,
      attachment_url: attachmentUrl,
      content,
      submission_notes: submissionNotes,
      storage_path: storagePath,
      file_name: fileName,
      file_mime_type: fileMimeType,
      file_size: fileSize,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 23505 = duplicate primary key → this exact submission already landed.
    // Checked BEFORE any rollback: the stored object may be the one the
    // successful insert already points at, so it must never be deleted.
    if (insertError.code === "23505") {
      const { data: existing } = await supabase
        .from("outputs")
        .select("id, employee_id, storage_path")
        .eq("id", id)
        .maybeSingle();

      if (existing && existing.employee_id === user.id) {
        // A retry with a different filename/uploads a new object, but the
        // database row already points at the first one. Remove only the
        // orphan we just wrote; never delete the stored file the row uses.
        if (storagePath && existing.storage_path !== storagePath) {
          await removeOrphanUpload(storagePath, user.id);
        }
        return NextResponse.json({ id, duplicate: true }, { status: 200 });
      }

      // The reference collides with another account's row. The object just
      // uploaded lives under this user's folder, so it cannot belong to that
      // row and is safe to remove.
      if (storagePath) {
        await removeOrphanUpload(storagePath, user.id);
      }
      return fail(409, "DUPLICATE", "That submission reference is already in use.", {
        retryable: false,
      });
    }

    // A genuine failure: the row does not exist, so the upload is orphaned.
    if (storagePath) {
      await removeOrphanUpload(storagePath, user.id);
    }

    console.error("output insert failed:", insertError.message);
    return fail(
      500,
      "DB_ERROR",
      "The submission could not be saved. Nothing was stored — please try again.",
      { retryable: true }
    );
  }

  if (!inserted?.id) {
    if (storagePath) {
      await removeOrphanUpload(storagePath, user.id);
    }
    return fail(500, "DB_ERROR", "The submission could not be confirmed. Please try again.", {
      retryable: true,
    });
  }

  // The review-queue row is created by the on_output_submitted_mirror
  // trigger (security definer), so there is exactly one review entry per
  // submission and no client-side duplicate insert.
  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
