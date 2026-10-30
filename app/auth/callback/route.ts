import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RESET_PATH = "/reset-password";
const INVALID_PATH = `${RESET_PATH}?error=invalid_link`;

/**
 * Every recovery outcome lands on the reset screen, which owns the UI for
 * invalid links. A redirect response is never cached: it can carry a
 * single-use code exchange result.
 */
function resetRedirect(request: NextRequest, invalid = false): NextResponse {
  const response = NextResponse.redirect(
    new URL(invalid ? INVALID_PATH : RESET_PATH, request.url)
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  // Supabase appends `error` / `error_code` when it rejects the recovery
  // token (expired, already used, tampered). Do not echo those details back
  // to the client or into logs — the reset page shows one generic message.
  if (
    searchParams.get("error") ||
    searchParams.get("error_code") ||
    !code
  ) {
    return resetRedirect(request, true);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Log only the non-sensitive classifier, never the code or URL.
    console.error(
      "[auth/callback] code exchange failed:",
      error.code ?? error.name
    );
    return resetRedirect(request, true);
  }

  return resetRedirect(request);
}
