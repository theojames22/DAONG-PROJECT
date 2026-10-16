/**
 * Filename helpers for downloading stored files.
 *
 * Files live behind public storage URLs (e.g. Supabase), so the only
 * reliable source for the original name is the last path segment of the
 * URL. Values are sanitized before being echoed in a
 * `Content-Disposition: attachment` header or a `download` attribute.
 */

/** Original filename from a URL's last path segment, decoded. */
export function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const segment = decodeURIComponent(
      new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    );
    return segment || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Make a name safe for a Content-Disposition header / download attribute:
 * no quotes, control characters, or path separators, and a sane length.
 */
export function safeFileName(name: string, fallback = "download"): string {
  const cleaned = name
    .replace(/[\\/]+/g, "_") // path separators → underscore
    .replace(/["'`]/g, "") // would break the header quoting
    .replace(/[\u0000-\u001f\u007f]/g, "") // control characters
    .trim()
    .slice(0, 180);

  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}
