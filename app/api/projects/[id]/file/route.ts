import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFileName } from "@/lib/file-name";
import {
  PROJECT_FILES_BUCKET,
  storagePathFromUrl,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return NextResponse.json({ error: "File not found." }, { status: 404 });
}

/**
 * Streams the attachment linked to a project review row.
 *
 * The project row is read through RLS first (owner or Head). When the project
 * was mirrored from an output submission, the output is read through its own
 * RLS policy too. No remote URL is ever fetched: a legacy file_url is only
 * accepted when it resolves to an object inside the private project bucket.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, source_output_id, file_url, title")
    .eq("id", params.id)
    .maybeSingle();

  if (projectError || !project) return notFound();

  let objectPath: string | null = null;
  let fileName = (project.title as string | null) || "attachment";
  let mimeType: string | null = null;

  if (project.source_output_id) {
    const { data: output } = await supabase
      .from("outputs")
      .select(
        "id, attachment_type, attachment_url, storage_path, file_name, file_mime_type"
      )
      .eq("id", project.source_output_id)
      .maybeSingle();

    if (!output) return notFound();
    if (output.attachment_type !== "file" && output.attachment_type !== "image") {
      return notFound();
    }

    objectPath =
      (output.storage_path as string | null) ||
      storagePathFromUrl(output.attachment_url as string | null);
    fileName = (output.file_name as string | null) || fileName;
    mimeType = (output.file_mime_type as string | null) || null;
  } else {
    objectPath = storagePathFromUrl(project.file_url as string | null);
  }

  if (!objectPath) return notFound();

  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from(PROJECT_FILES_BUCKET)
    .download(objectPath);

  if (downloadError || !blob) return notFound();

  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "1";
  const isImage =
    mimeType?.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(fileName);
  const filename = safeFileName(fileName, "attachment");

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": mimeType || blob.type || "application/octet-stream",
      "Content-Length": String(blob.size),
      "Content-Disposition": `${
        isImage && !forceDownload ? "inline" : "attachment"
      }; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
