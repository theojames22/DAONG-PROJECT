import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFileName } from "@/lib/file-name";
import { isInlineImageMime, safeContentType } from "@/lib/outputs";
import {
  isSafeStoragePath,
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
 * Streams one output attachment after the RLS-guarded output row has been
 * read. Authorization is the output row itself (owner or Head); Storage is
 * read with the service role only after that check, so a missing storage
 * policy cannot accidentally widen file access.
 *
 * Links and written outputs are intentionally not proxied here.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: output, error } = await supabase
    .from("outputs")
    .select(
      "id, employee_id, attachment_type, attachment_url, storage_path, file_name, file_mime_type"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !output) return notFound();
  if (output.attachment_type !== "file" && output.attachment_type !== "image") {
    return notFound();
  }

  const objectPath =
    (output.storage_path as string | null) ||
    storagePathFromUrl(output.attachment_url as string | null);

  if (!isSafeStoragePath(objectPath)) return notFound();

  // A Staff owner may only read objects under their own uid folder. Legacy
  // rows could have been inserted with an arbitrary storage path before the
  // server-only write path existed; the service-role download must not turn
  // that into cross-user file access. Heads keep their existing access.
  if (
    output.employee_id === user.id &&
    !objectPath.startsWith(`${user.id}/`)
  ) {
    return notFound();
  }

  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from(PROJECT_FILES_BUCKET)
    .download(objectPath);

  if (downloadError || !blob) return notFound();

  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "1";
  const storedMime =
    (output.file_mime_type as string | null) || blob.type || null;
  const canInline =
    output.attachment_type === "image" && isInlineImageMime(storedMime);
  const filename = safeFileName(
    (output.file_name as string | null) || objectPath.split("/").pop() || "attachment",
    "attachment"
  );

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": safeContentType(storedMime),
      "Content-Length": String(blob.size),
      "Content-Disposition": `${
        canInline && !forceDownload ? "inline" : "attachment"
      }; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
