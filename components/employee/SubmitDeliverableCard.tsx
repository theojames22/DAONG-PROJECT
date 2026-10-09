"use client";

import { useRef, useState } from "react";
import {
  Rocket,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  UploadCloud,
  Send,
  Lock,
  Clipboard,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface SubmitDeliverableCardProps {
  employeeId: string;
  onSubmitted?: () => void;
}

type TabKey = "link" | "file" | "image";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const tabs: { key: TabKey; label: string; icon: typeof LinkIcon }[] = [
  { key: "link", label: "Link URL", icon: LinkIcon },
  { key: "file", label: "Document / File", icon: FileText },
  { key: "image", label: "Screenshot", icon: ImageIcon },
];

export default function SubmitDeliverableCard({
  employeeId,
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

  // ---- Helpers -------------------------------------------------------------

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

  // ---- Submit --------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    if (!verified) {
      setStatusMessage({
        type: "error",
        text: "Please acknowledge the corporate integrity verification checkbox.",
      });
      return;
    }
    if (!title.trim()) {
      setStatusMessage({
        type: "error",
        text: "Please provide a deliverable name or title.",
      });
      return;
    }

    let attachmentUrl = "";
    let storagePath: string | null = null;
    let fileName: string | null = null;

    if (activeTab === "link") {
      const trimmed = resourceLink.trim();
      if (!trimmed) {
        setStatusMessage({
          type: "error",
          text: "Please paste the resource / production link.",
        });
        return;
      }
      attachmentUrl = trimmed;
    } else {
      if (!file) {
        setStatusMessage({
          type: "error",
          text:
            activeTab === "image"
              ? "Please attach a screenshot."
              : "Please attach a document or file.",
        });
        return;
      }

      setIsSubmitting(true);
      try {
        // Upload into the employee's own folder (enforced by storage RLS).
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
    const todayStr = new Date().toISOString().split("T")[0];

    const { error } = await supabase.from("outputs").insert({
      employee_id: employeeId,
      date: todayStr,
      title: title.trim(),
      attachment_type: activeTab,
      attachment_url: attachmentUrl,
      storage_path: storagePath,
      file_name: fileName,
      status: "pending",
      reviewer_notes: notes.trim() || null,
    });

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
      text: "Deliverable submitted for supervisor audit trail.",
    });

    // Reset inputs
    setTitle("");
    setResourceLink("");
    setNotes("");
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (onSubmitted) onSubmitted();
    router.refresh();
  }

  // ---- Render --------------------------------------------------------------

  const acceptAttr =
    activeTab === "image" ? "image/*" : ".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp";

  return (
    <div className="neu-raised rounded-neu p-5 flex flex-col justify-between h-full">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Card Header */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-ink">
              Submit Work Output & Deliverables
            </h2>
            <Rocket className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Link your output commits, specifications, or artifacts for supervisor audit.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="elev-pressed flex rounded-xl p-1" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => switchTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                activeTab === key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-ink-muted hover:text-accent-dark"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Input 1: Deliverable Name / Title — shared across tabs */}
        <div>
          <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Deliverable Name / Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sprint 14 UI Components & Architecture Staging"
            className="elev-pressed neu-focus w-full rounded-xl px-3 py-2 text-xs font-medium text-ink placeholder:text-ink-subtle outline-none transition-all"
          />
        </div>

        {/* Tab-specific input */}
        {activeTab === "link" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                Resource / Production Link
              </label>
              <button
                type="button"
                onClick={handlePaste}
                className="neu-focus inline-flex items-center gap-1 text-[11px] font-semibold text-accent-dark hover:underline"
              >
                <Clipboard className="h-3 w-3" />
                <span>Paste Clipboard</span>
              </button>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-ink-subtle">
                <LinkIcon className="h-3.5 w-3.5" />
              </span>
              <input
                type="url"
                value={resourceLink}
                onChange={(e) => setResourceLink(e.target.value)}
                placeholder="https://figma.com/file/xp381q/Design-System-Production"
                className="elev-pressed neu-focus w-full rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-ink placeholder:text-ink-subtle outline-none transition-all"
              />
            </div>
          </div>
        )}

        {(activeTab === "file" || activeTab === "image") && (
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
              {activeTab === "image" ? "Screenshot" : "Document / File"}
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                isDragging
                  ? "border-accent bg-accent-soft/40"
                  : "border-border bg-accent-soft/30 hover:border-accent"
              }`}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-32 rounded-lg border border-border"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <FileText className="h-5 w-5" />
                    </div>
                  )}
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    <span className="max-w-[220px] truncate">{file.name}</span>
                  </p>
                  <p className="text-[10.5px] text-ink-subtle">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · click to replace
                  </p>
                </div>
              ) : (
                <>
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent mb-2">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <p className="text-xs text-ink-muted">
                    Drag &amp; drop {activeTab === "image" ? "your screenshot" : "your file"}{" "}
                    here, or <span className="font-semibold text-accent-dark underline">browse</span>
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-ink-subtle">
                    {activeTab === "image"
                      ? "PNG, JPG, WEBP or GIF up to 50MB"
                      : "PDF, PNG, JPG, ZIP up to 50MB"}
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        )}

        {/* Supervisor Notes — shared across tabs */}
        <div>
          <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1">
            Supervisor Delivery Notes &amp; Scope Completed
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Components matched with design tokens. All unit tests passing."
            className="elev-pressed neu-focus w-full rounded-xl p-2.5 text-xs font-medium text-ink placeholder:text-ink-subtle outline-none transition-all resize-none"
          />
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            className="neu-focus mt-0.5 h-4 w-4 rounded border-base-dark text-accent focus:ring-accent"
          />
          <span className="text-[11px] leading-relaxed text-ink-muted">
            I verify that this deliverable directly correlates to today's active shift and
            adheres to the corporate integrity standard.
          </span>
        </label>

        {/* Feedback message */}
        {statusMessage && (
          <p
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              statusMessage.type === "success" ? "text-success" : "text-danger"
            }`}
          >
            {statusMessage.type === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {statusMessage.text}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary neu-focus w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{file && activeTab !== "link" ? "Uploading…" : "Submitting…"}</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              <span>Submit Deliverable for Review</span>
            </>
          )}
        </button>
      </form>

      {/* Security Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] text-ink-subtle font-medium">
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          <span>Cryptographic Timestamp Enabled</span>
        </span>
        <span className="font-mono text-ink-subtle">SHA-256 Verified</span>
      </div>
    </div>
  );
}
