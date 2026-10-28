import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/outputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reads the body of a Written Output on demand.
 *
 * Written bodies are intentionally kept out of every list/poll query
 * (telemetry runs every few seconds), so the viewer asks for the single row
 * it is about to display. Authorization is the existing RLS policy on
 * `outputs` — a staff member can only read their own row, a Head can read
 * any — and the query below is the whole access check.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: output, error } = await supabase
    .from("outputs")
    .select("id, title, attachment_type, content, submission_notes")
    .eq("id", id)
    .maybeSingle();

  if (error || !output || output.attachment_type !== "written") {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.json(
    {
      id: output.id,
      title: output.title,
      content: output.content ?? "",
      notes: output.submission_notes ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
