"use client";

import { useId, useState } from "react";
import { Eye, PenLine } from "lucide-react";
import styles from "@/app/employee/outputs/my-outputs.module.css";
import { WRITTEN_CONTENT_MAX, countCharacters } from "@/lib/outputs";

interface WrittenOutputEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Visual variant only; the plain-text editing behaviour is identical. */
  appearance?: "default" | "workspace";
}

/**
 * The Writing tab of the submission form.
 *
 * Deliberately plain text: a textarea plus a preview that renders the same
 * characters with `whitespace-pre-wrap`. There is no HTML editor and no
 * HTML rendering anywhere in the path, so a submitted `<script>` is shown
 * to the reviewer as a literal string — nothing to sanitize, nothing to
 * execute.
 */
export default function WrittenOutputEditor({
  value,
  onChange,
  disabled = false,
  appearance = "default",
}: WrittenOutputEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  const counterId = useId();
  const textareaId = useId();
  const workspace = appearance === "workspace";

  const count = countCharacters(value);
  const overLimit = count > WRITTEN_CONTENT_MAX;
  const nearLimit = !overLimit && count >= WRITTEN_CONTENT_MAX * 0.9;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={textareaId}
          className={
            workspace
              ? `${styles.fieldLabel} mb-0`
              : "block text-xs font-bold text-staff-ink"
          }
        >
          Written output
        </label>
        <button
          type="button"
          onClick={() => setPreviewing((p) => !p)}
          aria-pressed={previewing}
          className={
            workspace
              ? styles.tinyBtn
              : "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-staff-blue-ink transition-colors hover:bg-staff-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
          }
        >
          <Eye className="h-3 w-3" />
          <span>{previewing ? "Back to writing" : "Preview"}</span>
        </button>
      </div>

      {previewing ? (
        <div
          className={
            workspace
              ? styles.editorPreview
              : "min-h-[200px] rounded-xl border border-staff-border bg-slate-50/60 p-3.5"
          }
        >
          {value.trim() ? (
            <div className="whitespace-pre-wrap break-words text-xs font-medium leading-relaxed text-staff-ink">
              {value}
            </div>
          ) : (
            <p className={workspace ? styles.hint : "text-xs text-staff-body"}>
              Nothing to preview yet — start writing and your text will appear
              here exactly as the reviewer will see it.
            </p>
          )}
        </div>
      ) : (
        <textarea
          id={textareaId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={9}
          spellCheck
          placeholder="Write the work here — what you completed, how it works, and anything your supervisor should check…"
          aria-describedby={counterId}
          className={
            workspace
              ? `${styles.editorTextarea} ${
                  overLimit ? "!border-[color:var(--mo-danger)]" : ""
                }`
              : `min-h-[200px] w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-xs font-medium leading-relaxed text-staff-ink placeholder:text-staff-muted outline-none transition-all focus:ring-2 ${
                  overLimit
                    ? "border-staff-danger focus:border-staff-danger focus:ring-red-500/20"
                    : "border-staff-border focus:border-blue-500 focus:ring-blue-500/20"
                }`
          }
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <p
          className={
            workspace
              ? `${styles.hint} flex items-center gap-1.5`
              : "flex items-center gap-1.5 text-[10.5px] text-staff-body"
          }
        >
          <PenLine className="h-3 w-3 shrink-0" />
          <span>
            Plain text. Line breaks and spacing are preserved for the reviewer.
          </span>
        </p>
        <p
          id={counterId}
          aria-live="polite"
          className={`shrink-0 text-[10.5px] font-semibold tabular-nums ${
            overLimit
              ? "text-staff-danger"
              : nearLimit
                ? "text-staff-warning"
                : "text-staff-body"
          }`}
        >
          {count.toLocaleString()} / {WRITTEN_CONTENT_MAX.toLocaleString()}
        </p>
      </div>

      {overLimit && (
        <p role="alert" className="text-[11px] font-semibold text-staff-danger">
          Your output is {(count - WRITTEN_CONTENT_MAX).toLocaleString()} characters
          over the limit. Shorten it before submitting.
        </p>
      )}
    </div>
  );
}
