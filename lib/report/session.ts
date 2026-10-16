/**
 * Shared guard for the report endpoints. Identity and role always come
 * from the Supabase session — never from a client-supplied field. Staff
 * (role 'staff') are refused on every report endpoint; Heads carry role
 * 'head' so they pass the Head-only check.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export interface ReportSession {
  supabase: SupabaseClient;
  user: User;
}

export type GuardResult =
  | { ok: true; session: ReportSession }
  | { ok: false; response: NextResponse };

export async function requireReportAccess(): Promise<GuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Heads carry role 'head' and are the administrators.
  if (profile?.role !== "head") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Head access required." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: { supabase, user } };
}
