/** Shared Storage constants and URL helpers (safe on both server and client). */

export const PROJECT_FILES_BUCKET = "project-files";

/** Storage paths are relative object keys, never traversal or absolute paths. */
export function isSafeStoragePath(
  value: string | null | undefined
): value is string {
  if (!value) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return false;
  }

  return value
    .split("/")
    .every((part) => part.length > 0 && part !== "." && part !== "..");
}

/**
 * Extract the object path from a Supabase Storage public/sign URL.
 *
 * Legacy rows written before the bucket became private stored only
 * `attachment_url`. The authenticated file routes still need to resolve those
 * rows, so this accepts both URL forms and rejects anything that is not a
 * path inside the configured bucket.
 */
export function storagePathFromUrl(
  value: string | null | undefined,
  bucket = PROJECT_FILES_BUCKET
): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const marker = `/storage/v1/object/`;
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex === -1) return null;

  const segments = url.pathname
    .slice(markerIndex + marker.length)
    .split("/")
    .filter(Boolean);
  // .../object/public/<bucket>/<path> or .../object/sign/<bucket>/<path>
  if (segments.length < 3 || segments[1] !== bucket) return null;

  const rawPath = segments.slice(2).join("/");
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  // Storage paths are relative object keys, never traversal or absolute paths.
  return isSafeStoragePath(decoded) ? decoded : null;
}

/** The authenticated route that streams one output's attachment. */
export function outputFileUrl(outputId: string): string {
  return `/api/outputs/${encodeURIComponent(outputId)}/file`;
}

/** The authenticated route that streams one project's linked attachment. */
export function projectFileUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/file`;
}
