import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fileNameFromUrl, safeFileName } from "@/lib/file-name";

/**
 * Streams a submitted project file as an attachment.
 *
 * Two reasons this lives on the server:
 *   1. Browsers ignore the `download` attribute on cross-origin URLs
 *      (Supabase storage), so the file would open in a tab instead.
 *   2. Authorization: the projects RLS policy restricts the row to its
 *      submitter and Heads, so this one query IS the access check.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 404 (not 403) so the route never confirms a project exists to someone
  // who isn't allowed to see it.
  if (!user) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, file_url")
    .eq("id", params.id)
    .single();

  // A Written Output has no file to stream — it has no URL at all (the body
  // is reviewed in the app, never downloaded). Same answer for a legacy row
  // whose URL is missing or is not a fetchable http(s) address.
  if (
    error ||
    !project?.file_url ||
    !/^https?:\/\//i.test(project.file_url)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(project.file_url);
  } catch {
    return new NextResponse("Could not reach the stored file", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("File unavailable", { status: 502 });
  }

  // Original filename when possible, sanitized for the header.
  const fileName = safeFileName(
    fileNameFromUrl(project.file_url, project.title || "project")
  );

  const headers = new Headers();
  headers.set(
    "Content-Disposition",
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  headers.set(
    "Content-Type",
    upstream.headers.get("content-type") ?? "application/octet-stream"
  );
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  // The body depends on who asked, so keep it out of shared caches.
  headers.set("Cache-Control", "private, no-store");

  return new NextResponse(upstream.body, { status: 200, headers });
}
