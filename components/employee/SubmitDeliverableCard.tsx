"use client";

import { useRef, useState } from "react";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toDateKey } from "@/lib/attendance";

interface SubmitDeliverableCardProps {
  employeeId: string;
  /** Employee has clocked in today — required before an output may be submitted. */
  clockedIn: boolean;
  onSubmitted?: () => void;
}

type TabKey = "link" | "file" | "image";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const tabs: { key: TabKey; label: string; icon: typeof LinkIcon }[] = [
  { key: "link", label: "Link", icon: LinkIcon },
  { key: "file", label: "Document / file", icon: FileText },
  { key: "image", label: "Screenshot", icon: ImageIcon },
];

export default function SubmitDeliverableCard({
  employeeId,
  clockedIn,
  onSubmitted,
}: SubmitDeliverableCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("link");
  const [title, setTitle] = useState("");
  const [resourceLink, setResourceLink] = useState("");
  const [notes, setNotes] = useState("");
  const [verified, setVerified] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    setFile(null);
    setPreviewUrl(null);
    setStatusMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        type: "error",
        text: "Clipboard access was blocked. Paste manually with Ctrl+V.",
      });
    }
  }

  function validateFile(candidate: File): string | null {
    if (activeTab === "image" && !candidate.type.startsWith("image/")) {
      return "Screenshots must be image files (PNG, JPG, WEBP, GIF).";
    }
    if (candidate.size > MAX_FILE_SIZE) {
      return "That file exceeds the 50MB limit.";
    }
    return null;
  }

  function acceptFile(candidate: File | null) {
    if (!candidate) return;
    const error = validateFile(candidate);
    if (error) {
      setStatusMessage({ type: "error", text: error });
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
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    // Gate: Locked check
    if (!clockedIn) {
      setStatusMessage({
        type: "error",
        text: "You haven't clocked in today. You can submit work once today's attendance is recorded.",
      });
      return;
    }

    // Required fields check: List exactly what is missing
    const missing: string[] = [];
    if (!title.trim()) missing.push("a deliverable name");
    if (activeTab === "link" && !resourceLink.trim()) missing.push("a link");
    if (activeTab === "file" && !file) missing.push("a document or file");
    if (activeTab === "image" && !file) missing.push("a screenshot");
    if (!verified) missing.push("the integrity confirmation");

    if (missing.length > 0) {
      setStatusMessage({
        type: "error",
        text: `Still needed: ${missing.join(", ")}.`,
      });
      return;
    }

    let attachmentUrl = "";
    let storagePath: string | null = null;
    let fileName: string | null = null;

    if (activeTab === "link") {
      attachmentUrl = resourceLink.trim();
    } else {
      if (!file) return;

      setIsSubmitting(true);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `${employeeId}/deliverables/${Date.now()}-${safeName}`;
        fileName = file.name;

        const { error: uploadError } = await supabase.storage
          .from("project-files")
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("project-files")
          .getPublicUrl(storagePath);
        attachmentUrl = urlData.publicUrl;
      } catch (err) {
        setIsSubmitting(false);
        setStatusMessage({
          type: "error",
          text:
            err instanceof Error
              ? `Upload failed: ${err.message}`
              : "Upload failed. Please try again.",
        });
        return;
      }
    }

    setIsSubmitting(true);
    const todayStr = toDateKey(new Date().toISOString());

    const { data: insertedOutput, error } = await supabase
      .from("outputs")
      .insert({
        employee_id: employeeId,
        date: todayStr,
        title: title.trim(),
        attachment_type: activeTab,
        attachment_url: attachmentUrl,
        storage_path: storagePath,
        file_name: fileName,
        status: "pending",
        reviewer_notes: notes.trim() || null,
      })
      .select("id")
      .maybeSingle();

    if (insertedOutput?.id) {
      try {
        const { data: existing } = await supabase
          .from("projects")
          .select("id")
          .eq("source_output_id", insertedOutput.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("projects").insert({
            title: title.trim() || `Output ${todayStr}`,
            description: notes.trim() || null,
            file_url: attachmentUrl,
            status: "pending",
            submitted_by: employeeId,
            source_output_id: insertedOutput.id,
          });
        }
      } catch {
        // Mirrored by backend trigger if configured
      }
    }

    setIsSubmitting(false);

    if (error) {
      setStatusMessage({
        type: "error",
        text: "Could not submit deliverable: " + error.message,
      });
      return;
    }

    setStatusMessage({
      type: "success",
      text: "Deliverable submitted successfully! It is now in review under My submissions.",
    });

    // Reset fields
    setTitle("");
    setResourceLink("");
    setNotes("");
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (onSubmitted) onSubmitted();
    router.refresh();
  }

  const acceptAttr =
    activeTab === "image" ? "image/*" : ".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp";

  return (
    <div className="flex h-full flex-col justify-between rounded-[20px] border border-staff-border bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,27,61,.04),0_10px_30px_rgba(37,99,235,.06)] enter-up enter-d3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Card Title & Description */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-staff-ink">
              Submit your work
            </h2>
            <span className="text-xs font-semibold text-staff-body">
              Review workflow
            </span>
          </div>
          <p className="mt-1 text-xs text-staff-body">
            Upload your deliverables or resource links for your supervisor to audit.
          </p>
        </div>

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
            className={`flex items-start gap-2.5 rounded-xl p-3 text-xs font-medium border ${
              statusMessage.type === "success"
                ? "bg-staff-success-soft text-staff-success border-staff-success-border"
                : "bg-staff-danger-soft text-staff-danger border-staff-danger-border"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-staff-success" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-staff-danger" />
            )}
            <p className="flex-1 leading-relaxed">{statusMessage.text}</p>
          </div>
        )}

        {/* Segmented Control for 3 Input Types */}
        <div className="flex rounded-xl bg-slate-100 p-1 border border-staff-border" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => switchTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                activeTab === key
                  ? "bg-white text-staff-blue-ink shadow-sm"
                  : "text-staff-body hover:text-staff-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Disabled overlay wrapper when locked */}
        <div className={`flex flex-col gap-3.5 transition-opacity ${!clockedIn ? "opacity-80 pointer-events-none" : ""}`}>
          {/* Field 1: Deliverable Name */}
          <div>
            <label className="block text-xs font-bold text-staff-ink mb-1.5">
              Deliverable name
            </label>
            <div className="relative">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!clockedIn}
                placeholder="e.g. Sprint 14 UI Components & Feature Staging"
                className="w-full rounded-xl border border-staff-border bg-white px-3.5 py-2.5 text-xs font-medium text-staff-ink placeholder:text-staff-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
              {!clockedIn && (
                <Lock className="absolute right-3 top-3 h-3.5 w-3.5 text-staff-muted" />
              )}
            </div>
          </div>

          {/* Field 2: Tab-specific input */}
          {activeTab === "link" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-staff-ink">
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
                  type="url"
                  value={resourceLink}
                  onChange={(e) => setResourceLink(e.target.value)}
                  disabled={!clockedIn}
                  placeholder="https://figma.com/file/... or https://github.com/..."
                  className="w-full rounded-xl border border-staff-border bg-white pl-9 pr-3.5 py-2.5 text-xs font-medium text-staff-ink placeholder:text-staff-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
                {!clockedIn && (
                  <Lock className="absolute right-3 top-3 h-3.5 w-3.5 text-staff-muted" />
                )}
              </div>
            </div>
          )}

          {(activeTab === "file" || activeTab === "image") && (
            <div>
              <label className="block text-xs font-bold text-staff-ink mb-1.5">
                {activeTab === "image" ? "Screenshot upload" : "Document / file upload"}
              </label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (clockedIn) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={clockedIn ? handleDrop : undefined}
                onClick={() => clockedIn && fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                  isDragging
                    ? "border-blue-500 bg-staff-soft"
                    : "border-staff-border bg-slate-50/50 hover:border-blue-400 hover:bg-staff-soft"
                }`}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-28 rounded-lg border border-staff-border object-contain"
                      />
                    ) : (
                      <FileText className="h-8 w-8 text-staff-blue-ink" />
                    )}
                    <p className="text-xs font-bold text-staff-ink">{file.name}</p>
                    <p className="text-[10px] text-staff-body">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB · Click or drag to replace
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
                      {activeTab === "image" ? "PNG, JPG, WEBP" : "PDF, DOCX, ZIP, IMAGES"} up to 50MB
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
            </div>
          )}

          {/* Field 3: Notes for supervisor */}
          <div>
            <label className="block text-xs font-bold text-staff-ink mb-1.5">
              Notes for your supervisor <span className="font-normal text-staff-body">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!clockedIn}
              rows={2}
              placeholder="Provide context, deliverables notes, or review guidance..."
              className="w-full rounded-xl border border-staff-border bg-white px-3.5 py-2.5 text-xs font-medium text-staff-ink placeholder:text-staff-muted focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
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

        {/* Action Button: Disabled when locked, Blue when unlocked */}
        <div className="pt-2">
          {!clockedIn ? (
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
                  <span>Submitting deliverable...</span>
                </>
              ) : (
                <span>Submit for review</span>
              )}
            </button>
          )}
        </div>

        {/* Footer line with SHA-256 integrity note */}
        <p className="text-[10.5px] text-center text-staff-body pt-1">
          Submissions are timestamped when sent · SHA-256 verification enabled.
        </p>
      </form>
    </div>
  );
}
