"use client";

import { useEffect, useRef, useState } from "react";
import {
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  UploadCloud,
  Lock,
  Clipboard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_IMAGE_EXTENSIONS,
  MAX_FILE_SIZE,
  NOTES_MAX,
  TITLE_MAX,
  formatFileSize,
  newSubmissionId,
  validateAttachment,
  validateSubmission,
  type SubmissionType,
} from "@/lib/outputs";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import WrittenOutputEditor from "./WrittenOutputEditor";

interface SubmitDeliverableCardProps {
  /** Employee has clocked in today — required before an output may be submitted. */
  clockedIn: boolean;
  onSubmitted?: () => void;
  /**
   * Drops the card chrome (border, radius, shadow, entrance animation) so the
   * exact same form can live inside a modal. Defaults to false — the
   * dashboard card is unchanged.
   */
  embedded?: boolean;
  /**
   * Visual variant only. "workspace" opts into the My Outputs modal tokens;
   * the submission logic, validation and endpoints are identical.
   */
  appearance?: "default" | "workspace";
  /** Optional cancel action rendered beside the submit button in the modal. */
  onCancel?: () => void;
}

type TabKey = SubmissionType;

const tabs: { key: TabKey; label: string; icon: typeof LinkIcon; hint: string }[] = [
  { key: "written", label: "Written", icon: PenLine, hint: "Type the work directly — no upload needed" },
  { key: "file", label: "File", icon: FileText, hint: "Upload a document" },
  { key: "image", label: "Image", icon: ImageIcon, hint: "Upload a screenshot or image" },
  { key: "link", label: "Link", icon: LinkIcon, hint: "Point to externally hosted work" },
];

interface StatusMessage {
  tone: "success" | "error";
  text: string;
  /** Upload failures get Retry / Continue with Written Output actions. */
  recoverUpload?: boolean;
}

interface XhrResult {
  status: number;
  body: {
    id?: string;
    duplicate?: boolean;
    error?: {
      code?: string;
      message?: string;
      canSwitchToWritten?: boolean;
      retryable?: boolean;
    };
  } | null;
}

/** XHR (not fetch) because it is the only way to report upload progress. */
function postSubmission(form: FormData, onProgress: (percent: number) => void) {
  return new Promise<XhrResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/outputs");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      let body: XhrResult["body"] = null;
      try {
        body = JSON.parse(xhr.responseText) as XhrResult["body"];
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Timeout"));
    xhr.send(form);
  });
}

export default function SubmitDeliverableCard({
  clockedIn,
  onSubmitted,
  embedded = false,
  appearance = "default",
  onCancel,
}: SubmitDeliverableCardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const workspace = appearance === "workspace";

  const [activeTab, setActiveTab] = useState<TabKey>("written");
  /**
   * One reference per form session. It is the row's id AND the idempotency
   * key: a double click or a retried request reuses it, so the server can
   * recognise the submission instead of creating a duplicate.
   */
  const [submissionId, setSubmissionId] = useState<string>(() => newSubmissionId());

  const [title, setTitle] = useState("");
  const [writtenContent, setWrittenContent] = useState("");
  const [resourceLink, setResourceLink] = useState("");
  const [notes, setNotes] = useState("");
  const [verified, setVerified] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  // Object URLs must be released or they leak one blob per chosen image.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // In the workspace modal, a validation/server error can be above the current
  // scroll position. Bring the banner into view without changing the shared
  // dashboard form's behaviour.
  useEffect(() => {
    if (!workspace || statusMessage?.tone !== "error") return;
    statusRef.current?.scrollIntoView({ block: "nearest" });
  }, [statusMessage, workspace]);

  function clearFile() {
    setFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Switching type keeps everything the user typed (title, notes, written
   * body, link) and drops only the attachment — the one value that would
   * otherwise be silently carried into a different submission type.
   */
  function switchTab(tab: TabKey) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setStatusMessage(null);
    clearFile();
  }

  function continueWithWritten() {
    setActiveTab("written");
    clearFile();
    setStatusMessage({
      tone: "error",
      text:
        "Switched to Written Output. Your title and notes are still here — write or paste the work, then submit. Nothing is uploaded.",
    });
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setResourceLink(text);
        setStatusMessage(null);
      }
    } catch {
      setStatusMessage({
        tone: "error",
        text: "Clipboard access was blocked. Paste manually with Ctrl+V.",
      });
    }
  }

  function acceptFile(candidate: File | null) {
    if (!candidate) return;

    const error =
      activeTab === "file" || activeTab === "image"
        ? validateAttachment(activeTab, {
            name: candidate.name,
            size: candidate.size,
            type: candidate.type,
          })
        : "Choose the File or Image tab first.";

    if (error) {
      clearFile();
      setStatusMessage({ tone: "error", text: error });
      return;
    }

    setStatusMessage(null);
    setFile(candidate);
    setPreviewUrl(
      activeTab === "image" ? URL.createObjectURL(candidate) : null
    );
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!clockedIn) return;
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  function resetForm() {
    setTitle("");
    setWrittenContent("");
    setResourceLink("");
    setNotes("");
    setFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSubmissionId(newSubmissionId());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitCurrent();
  }

  /** Retry reuses the exact same form state and submission reference. */
  function handleRetryUpload() {
    void submitCurrent();
  }

  async function submitCurrent() {
    if (isSubmitting) return;
    setStatusMessage(null);

    if (!clockedIn) {
      setStatusMessage({
        tone: "error",
        text: "You haven't clocked in today. You can submit work once today's attendance is recorded.",
      });
      return;
    }

    // Friendly, complete "what's missing" list before the detailed rules.
    const missing: string[] = [];
    if (!title.trim()) missing.push("a deliverable name");
    if (activeTab === "written" && !writtenContent.trim()) missing.push("the written output");
    if (activeTab === "link" && !resourceLink.trim()) missing.push("a link");
    if (activeTab === "file" && !file) missing.push("a document or file");
    if (activeTab === "image" && !file) missing.push("a screenshot");
    if (!verified) missing.push("the integrity confirmation");

    if (missing.length > 0) {
      setStatusMessage({
        tone: "error",
        text: `Still needed: ${missing.join(", ")}.`,
      });
      return;
    }

    const ruleError = validateSubmission({
      type: activeTab,
      title,
      content: writtenContent,
      link: resourceLink,
      notes,
      file: file ? { name: file.name, size: file.size, type: file.type } : null,
    });

    if (ruleError) {
      setStatusMessage({ tone: "error", text: ruleError });
      return;
    }

    const form = new FormData();
    form.set("id", submissionId);
    form.set("type", activeTab);
    form.set("title", title);
    form.set("notes", notes);

    // Only the field that belongs to the selected type is sent, so a link or
    // a file left over from another tab can never ride along.
    if (activeTab === "written") form.set("content", writtenContent);
    if (activeTab === "link") form.set("link", resourceLink);
    if ((activeTab === "file" || activeTab === "image") && file) {
      form.set("file", file, file.name);
    }

    setIsSubmitting(true);
    setProgress(activeTab === "file" || activeTab === "image" ? 0 : null);

    try {
      const { status, body } = await postSubmission(form, (percent) => {
        setProgress(percent);
      });

      if (status === 200 || status === 201) {
        setStatusMessage({
          tone: "success",
          text: body?.duplicate
            ? "This submission was already saved — it's pending review."
            : "Deliverable submitted successfully! It's now pending review.",
        });
        resetForm();
        if (onSubmitted) onSubmitted();
        router.refresh();
        return;
      }

      let message = body?.error?.message ?? "";

      // A reverse proxy or hosting platform can reject the body before the
      // route runs and answer with plain HTML instead of our JSON. Translate
      // the common statuses so the staff member still gets an actionable
      // message instead of a generic failure.
      if (!message) {
        if (status === 413) {
          message =
            "That attachment is larger than the server accepts in a single request, so it wasn't saved. Your title and notes are still here.";
        } else if (status === 507) {
          message =
            "File storage is full, so the attachment couldn't be saved. Your title and notes are still here.";
        } else if (status === 415) {
          message =
            "That file type isn't accepted, so the attachment wasn't saved. Your title and notes are still here.";
        } else {
          message =
            "The submission could not be saved. Nothing was stored — please try again.";
        }
      }

      setStatusMessage({
        tone: "error",
        text: message,
        // Anything that fails while a file/image is the chosen method offers
        // the two honest ways forward: try again, or switch to writing.
        recoverUpload: activeTab === "file" || activeTab === "image",
      });
    } catch {
      setStatusMessage({
        tone: "error",
        text: "The submission couldn't reach the server. Nothing was saved — check your connection and try again.",
        recoverUpload: activeTab === "file" || activeTab === "image",
      });
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  }

  const acceptAttr =
    activeTab === "image" ? ACCEPTED_IMAGE_EXTENSIONS : ACCEPTED_FILE_EXTENSIONS;
  const activeTabHint = tabs.find((t) => t.key === activeTab)?.hint ?? "";
  const isUpload = activeTab === "file" || activeTab === "image";
  const showProgress = isSubmitting && isUpload && progress !== null;

  return (
    <div
      className={
        embedded
          ? `flex flex-col ${workspace ? styles.workspaceForm : ""}`
          : "flex h-full flex-col justify-between rounded-[20px] border border-staff-border bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,27,61,.04),0_10px_30px_rgba(37,99,235,.06)] enter-up enter-d3"
      }
    >
      <form
        onSubmit={handleSubmit}
        className={`flex flex-col ${workspace ? "gap-5" : "gap-4"}`}
      >
        {/* Card Title & Description — the modal supplies its own header. */}
        {!embedded && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-staff-ink">
                Submit your work
              </h2>
              <span className="text-xs font-semibold text-staff-body">
                Review workflow
              </span>
            </div>
            <p className="mt-1 text-xs text-staff-body">
              Write the work directly, upload a deliverable, or send a link for your supervisor to audit.
            </p>
          </div>
        )}

        {/* State Banner: Locked (Amber) vs Unlocked (Green) */}
        {!clockedIn ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-staff-warning-border bg-staff-warning-soft p-3 text-xs font-semibold text-staff-warning">
            <Lock className="h-4 w-4 shrink-0 text-staff-warning" />
            <span>
              You haven&apos;t clocked in today. You can submit work once today&apos;s attendance is recorded.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl border border-staff-success-border bg-staff-success-soft p-3 text-xs font-semibold text-staff-success">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-staff-success" />
            <span>You&apos;re clocked in. Ready to submit deliverables for review.</span>
          </div>
        )}

        {/* Status Message / Inline Error Banner */}
        {statusMessage && (
          <div
            ref={statusRef}
            role={statusMessage.tone === "error" ? "alert" : "status"}
            className={`flex items-start gap-2.5 rounded-xl p-3 text-xs font-medium border ${
              statusMessage.tone === "success"
                ? "bg-staff-success-soft text-staff-success border-staff-success-border"
                : "bg-staff-danger-soft text-staff-danger border-staff-danger-border"
            }`}
          >
            {statusMessage.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-staff-success" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-staff-danger" />
            )}
            <div className="flex-1">
              <p className="leading-relaxed">{statusMessage.text}</p>
              {statusMessage.recoverUpload && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryUpload}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-staff-danger-border bg-white px-2.5 py-1.5 text-[11px] font-bold text-staff-danger transition-colors hover:bg-staff-danger-soft disabled:opacity-60"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry upload
                  </button>
                  <button
                    type="button"
                    onClick={continueWithWritten}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-staff-blue px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-staff-blue-dark"
                  >
                    <PenLine className="h-3 w-3" />
                    Continue with Written Output
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Segmented control for the four submission types */}
        <div
          className={
            workspace
              ? "grid grid-cols-2 gap-2 sm:grid-cols-4"
              : "grid grid-cols-2 gap-1 rounded-xl border border-staff-border bg-slate-100 p-1 sm:grid-cols-4"
          }
          role="tablist"
          aria-label="Submission type"
        >
          {tabs.map(({ key, label, icon: Icon, hint }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              title={hint}
              onClick={() => switchTab(key)}
              className={
                workspace
                  ? `${styles.choiceChip} inline-flex items-center justify-center gap-2 ${
                      activeTab === key ? styles.choiceChipOn : ""
                    }`
                  : `flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
                      activeTab === key
                        ? "bg-white text-staff-blue-ink shadow-sm"
                        : "text-staff-body hover:text-staff-ink"
                    }`
              }
            >
              <Icon
                className={workspace ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"}
              />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <p
          className={
            workspace
              ? `${styles.hint} -mt-2`
              : "-mt-1 text-[10.5px] font-medium text-staff-body"
          }
        >
          {activeTabHint}
          {activeTab === "written"
            ? " · nothing is uploaded or stored as a file."
            : ""}
        </p>

        {/* Disabled overlay wrapper when locked */}
        <div className={`flex flex-col gap-3.5 transition-opacity ${!clockedIn ? "opacity-80 pointer-events-none" : ""}`}>
          {/* Field 1: Deliverable Name */}
          <div>
            <label
              htmlFor="deliverable-title"
              className={
                workspace
                  ? styles.fieldLabel
                  : "block text-xs font-bold text-staff-ink mb-1.5"
              }
            >
              Deliverable name
            </label>
            <div className="relative">
              <input
                id="deliverable-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!clockedIn}
                maxLength={TITLE_MAX}
                placeholder="e.g. Sprint 14 UI Components & Feature Staging"
                className={
                  workspace
                    ? `${styles.input} ${!clockedIn ? "!pr-10" : ""}`
                    : "w-full rounded-xl border border-staff-border bg-white px-3.5 py-2.5 text-xs font-medium text-staff-ink placeholder:text-staff-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                }
              />
              {!clockedIn && (
                <Lock className="absolute right-3 top-3 h-3.5 w-3.5 text-staff-muted" />
              )}
            </div>
          </div>

          {/* Field 2: Tab-specific input */}
          {activeTab === "written" && (
            <WrittenOutputEditor
              value={writtenContent}
              onChange={setWrittenContent}
              disabled={!clockedIn}
              appearance={workspace ? "workspace" : "default"}
            />
          )}

          {activeTab === "link" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="submission-link"
                  className={
                    workspace
                      ? styles.fieldLabel
                      : "block text-xs font-bold text-staff-ink"
                  }
                >
                  Resource link
                </label>
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={!clockedIn}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-staff-blue-ink hover:underline"
                >
                  <Clipboard className="h-3 w-3" />
                  <span>Paste from clipboard</span>
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-staff-muted">
                  <LinkIcon className="h-3.5 w-3.5" />
                </span>
                <input
                  id="submission-link"
                  type="url"
                  value={resourceLink}
                  onChange={(e) => setResourceLink(e.target.value)}
                  disabled={!clockedIn}
                  placeholder="https://figma.com/file/... or https://github.com/..."
                  className={
                    workspace
                      ? `${styles.input} !pl-10 ${!clockedIn ? "!pr-10" : ""}`
                      : "w-full rounded-xl border border-staff-border bg-white pl-9 pr-3.5 py-2.5 text-xs font-medium text-staff-ink placeholder:text-staff-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  }
                />
                {!clockedIn && (
                  <Lock className="absolute right-3 top-3 h-3.5 w-3.5 text-staff-muted" />
                )}
              </div>
            </div>
          )}

          {(activeTab === "file" || activeTab === "image") && (
            <div>
              <label
                className={
                  workspace
                    ? styles.fieldLabel
                    : "block text-xs font-bold text-staff-ink mb-1.5"
                }
              >
                {activeTab === "image" ? "Screenshot upload" : "Document / file upload"}
              </label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (clockedIn) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => clockedIn && fileInputRef.current?.click()}
                className={
                  workspace
                    ? `${styles.uploadZone} ${
                        isDragging ? styles.uploadZoneActive : ""
                      }`
                    : `cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                        isDragging
                          ? "border-blue-500 bg-staff-soft"
                          : "border-staff-border bg-slate-50/50 hover:border-blue-400 hover:bg-staff-soft"
                      }`
                }
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Preview of the selected screenshot"
                        className="max-h-28 rounded-lg border border-staff-border object-contain"
                      />
                    ) : (
                      <FileText className="h-8 w-8 text-staff-blue-ink" />
                    )}
                    <p className="max-w-full truncate text-xs font-bold text-staff-ink">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-staff-body">
                      {formatFileSize(file.size)} · Click or drag to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-staff-soft text-staff-blue-ink">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-staff-ink">
                      Click to choose or drop {activeTab === "image" ? "screenshot" : "file"}
                    </p>
                    <p className="text-[10.5px] text-staff-body">
                      {activeTab === "image" ? "PNG, JPG, WEBP, GIF" : "PDF, DOCX, XLSX, PPTX, ZIP, TXT, IMAGES"} up to{" "}
                      {formatFileSize(MAX_FILE_SIZE)}
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptAttr}
                  onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </div>

              <p className="mt-1.5 text-[10.5px] text-staff-body">
                If the upload fails, your title and notes stay here and you can
                switch to Written Output.
              </p>
            </div>
          )}

          {/* Field 3: Notes / summary for the supervisor */}
          <div>
            <label
              htmlFor="submission-notes"
              className={
                workspace
                  ? styles.fieldLabel
                  : "block text-xs font-bold text-staff-ink mb-1.5"
              }
            >
              {activeTab === "written" ? "Summary" : "Notes for your supervisor"}{" "}
              <span className="font-normal text-staff-body">(optional)</span>
            </label>
            <textarea
              id="submission-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!clockedIn}
              rows={2}
              maxLength={NOTES_MAX}
              placeholder={
                activeTab === "written"
                  ? "A short description of the task, what was completed, or what to check…"
                  : "Provide context, deliverables notes, or review guidance..."
              }
              className={
                workspace
                  ? `${styles.input} ${styles.textarea}`
                  : "w-full rounded-xl border border-staff-border bg-white px-3.5 py-2.5 text-xs font-medium text-staff-ink placeholder:text-staff-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
              }
            />
          </div>

          {/* Field 4: Corporate integrity verification checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              disabled={!clockedIn}
              className="mt-0.5 h-4 w-4 rounded border-staff-border text-staff-blue-ink focus:ring-blue-500/20"
            />
            <span className="text-xs font-medium text-staff-body leading-tight">
              I confirm this work is complete, original, and ready for supervisor review.
            </span>
          </label>
        </div>

        {/* Upload progress */}
        {showProgress && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10.5px] font-semibold text-staff-body">
              <span>Uploading attachment…</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="h-full rounded-full bg-staff-blue transition-[width] duration-200"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Button: Disabled when locked, Blue when unlocked */}
        <div
          className={
            workspace
              ? "flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-end"
              : "pt-2"
          }
        >
          {workspace ? (
            <>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className={styles.ghostBtn}
                >
                  Cancel
                </button>
              )}
              {!clockedIn ? (
                <button type="button" disabled className={styles.primaryBtn}>
                  <Lock className="h-4 w-4" />
                  <span>Clock in to submit</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.primaryBtn}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {isUpload && progress !== null && progress < 100
                          ? `Uploading… ${progress}%`
                          : "Saving submission…"}
                      </span>
                    </>
                  ) : (
                    <span>Submit for review</span>
                  )}
                </button>
              )}
            </>
          ) : !clockedIn ? (
            <button
              type="button"
              disabled
              className="w-full rounded-xl border border-staff-border bg-slate-100 py-3 px-5 text-xs font-bold text-staff-body cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Lock className="h-4 w-4" />
              <span>Clock in to submit</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-staff-blue hover:bg-staff-blue-dark py-3 px-5 text-xs font-bold text-white shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:bg-staff-blue-dark disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {isUpload && progress !== null && progress < 100
                      ? `Uploading… ${progress}%`
                      : "Saving submission…"}
                  </span>
                </>
              ) : (
                <span>Submit for review</span>
              )}
            </button>
          )}
        </div>

        <p
          className={
            workspace
              ? `${styles.hint} pt-1 text-center`
              : "text-[10.5px] text-center text-staff-body pt-1"
          }
        >
          Submissions are timestamped when sent.
        </p>
      </form>
    </div>
  );
}
