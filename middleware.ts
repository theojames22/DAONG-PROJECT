import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verifies the access token locally against the project's JWKS and refreshes
  // it first when it is about to expire (getClaims -> getSession). This keeps
  // the same guarantee as getUser() — server components always see a valid
  // session — without paying a round trip to the Auth server on every
  // navigation. Role rules are still enforced from `profiles` in the
  // layouts/pages, so this is identity checking only.
  let claims = null;
  try {
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims ?? null;
  } catch (error) {
    console.error("Middleware auth getClaims error:", error);
  }

  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/employee") || path.startsWith("/head");

  if (isProtected && !claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/employee/:path*", "/head/:path*"],
};
