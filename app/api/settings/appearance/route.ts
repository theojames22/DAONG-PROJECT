import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parseAppearancePreferences,
  sanitizeAppearancePreferences,
  validateAppearancePreferences,
} from "@/lib/appearance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

/**
 * PostgREST reports a missing column as 42703 (SQL) or PGRST204 (stale schema
 * cache). A 23514 here is the legacy theme_preference check rejecting
 * "system" because the appearance migration has not been applied yet.
 */
const MIGRATION_ERROR_CODES = new Set(["42703", "42P01", "PGRST204", "23514"]);
const MIGRATION_MESSAGE =
  "Appearance storage is not ready. Run supabase/appearance_preferences.sql in the Supabase SQL Editor, then reload this page.";

function isMigrationError(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && MIGRATION_ERROR_CODES.has(error.code));
}

async function authenticatedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !userId) {
    return { supabase, userId: null as string | null };
  }
  return { supabase, userId };
}

/**
 * The only appearance endpoint. The user id always comes from the verified
 * session — never from the request body or query string. RLS on profiles is a
 * second line of defence.
 */
export async function GET() {
  const { supabase, userId } = await authenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401, headers: NO_STORE }
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("appearance_preferences, theme_preference")
    .eq("id", userId)
    .single();

  if (error || !data) {
    if (isMigrationError(error)) {
      return NextResponse.json(
        { error: MIGRATION_MESSAGE, code: "APPEARANCE_MIGRATION_REQUIRED" },
        { status: 503, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { error: "Could not load appearance preferences." },
      { status: 500, headers: NO_STORE }
    );
  }

  const preferences = sanitizeAppearancePreferences(
    data.appearance_preferences,
    data.theme_preference
  );

  return NextResponse.json({ preferences }, { headers: NO_STORE });
}

export async function PUT(request: Request) {
  const { supabase, userId } = await authenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401, headers: NO_STORE }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Appearance preferences must be a JSON object." },
      { status: 400, headers: NO_STORE }
    );
  }

  const { preferences, invalidColors } = parseAppearancePreferences(body);

  if (invalidColors.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid color value for ${invalidColors.join(", ")}. Use a HEX value such as #2563EB.`,
      },
      { status: 400, headers: NO_STORE }
    );
  }

  // Re-run the exact contrast rules used by the UI. When Auto-adjust is off,
  // an unreadable text/background pair is rejected rather than saved.
  const validation = validateAppearancePreferences(preferences);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Appearance was not saved because some text would be hard to read.",
        errors: validation.errors,
      },
      { status: 422, headers: NO_STORE }
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      appearance_preferences: preferences,
      // Keep the legacy column in sync for older code paths and for the
      // theme bootstrap fallback.
      theme_preference: preferences.mode,
    })
    .eq("id", userId)
    .select("appearance_preferences, theme_preference")
    .single();

  if (error || !data) {
    console.error("Appearance save failed:", error?.message);
    if (isMigrationError(error)) {
      return NextResponse.json(
        { error: MIGRATION_MESSAGE, code: "APPEARANCE_MIGRATION_REQUIRED" },
        { status: 503, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      {
        error:
          "The server could not save your appearance. Nothing was changed — please try again.",
      },
      { status: 500, headers: NO_STORE }
    );
  }

  // Return the row that was actually persisted, not the request payload. The
  // client only reports success after this response.
  const saved = sanitizeAppearancePreferences(
    data.appearance_preferences,
    data.theme_preference
  );

  return NextResponse.json({ preferences: saved }, { headers: NO_STORE });
}
