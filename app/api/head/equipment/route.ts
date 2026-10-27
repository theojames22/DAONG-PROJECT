import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Equipment catalog maintenance (GET list / POST add / DELETE remove).
 * Only Heads may change it — the caller's role is re-checked
 * server-side, never trusted from the client. Staff can still READ the
 * catalog through the RLS select policy, but this route itself is
 * Head-gated.
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "head") {
    return {
      error: NextResponse.json(
        { error: "Head access required." },
        { status: 403 }
      ),
    };
  }

  return {};
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, name, created_at")
    .order("name");

  if (error) {
    console.error("[equipment] list failed:", error.message);
    return NextResponse.json(
      { error: "Could not load the equipment list." },
      { status: 400 }
    );
  }

  return NextResponse.json({ equipment: data ?? [] });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const name = body?.name;
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed || trimmed.length > 120) {
    return NextResponse.json(
      { error: "Equipment name is required (maximum 120 characters)." },
      { status: 400 }
    );
  }

  // The admin client bypasses RLS; the role check above is the gate.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("equipment")
    .insert({ name: trimmed })
    .select("id, name")
    .single();

  if (error) {
    // 23505 = unique violation on equipment_name_key (case-insensitive)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That equipment already exists." },
        { status: 409 }
      );
    }
    console.error("[equipment] insert failed:", error.message);
    return NextResponse.json(
      { error: "Could not add the equipment. Try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ equipment: data });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const id = body?.id;

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    return NextResponse.json(
      { error: "A valid equipment ID is required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("equipment").delete().eq("id", id);

  if (error) {
    // 23503 = FK violation — equipment_usage rows still reference it
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "This equipment has usage records and can't be removed." },
        { status: 409 }
      );
    }
    console.error("[equipment] delete failed:", error.message);
    return NextResponse.json(
      { error: "Could not remove the equipment. Try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
