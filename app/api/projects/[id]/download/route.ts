import { NextResponse, type NextRequest } from "next/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Download is the attachment variant of the authenticated file route.
 *
 * This used to `fetch(project.file_url)` on the server, which turned a
 * user-controlled project field into an SSRF primitive. It now only redirects
 * to the same-origin route that reads the private Storage object after the
 * project/output RLS checks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const target = new URL(
    `/api/projects/${encodeURIComponent(id)}/file?download=1`,
    request.url
  );
  return NextResponse.redirect(target, 307);
}
