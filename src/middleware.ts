import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Refreshes the staff Supabase session cookie on staff routes. */
export async function middleware(request: NextRequest) {
  // Lets server pages send unauthenticated visitors to /login?next=<this page>.
  request.headers.set("x-fi-path", request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/tickets/:path*", "/assets/:path*", "/analytics/:path*", "/admin/:path*", "/login", "/api/tickets/:path*", "/api/admin/:path*", "/api/analytics/:path*", "/api/assets/:path*", "/api/demo/:path*", "/api/auth/:path*"],
};

