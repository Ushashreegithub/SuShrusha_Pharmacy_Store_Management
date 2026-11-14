import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Explicit allowlisted hostnames
const PLATFORM_HOSTS = new Set([
  "pharmapro.diracai.com",
  "localhost",
  "127.0.0.1",
]);

const SUSHRUSHA_HOSTS = new Set([
  "erp.sushrusaeclinic.com",
  "sushrusha.localhost",
]);

/**
 * Normalizes host by stripping port, trailing periods, and lowercasing.
 */
function normalizeHost(rawHost: string | null): string {
  if (!rawHost) return "";
  return rawHost.split(":")[0].toLowerCase().trim().replace(/\.$/, "");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip Next.js internals, static files, and API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/images") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Extract and normalize hostname
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  );

  const isSushrushaHost = SUSHRUSHA_HOSTS.has(host);
  const isPlatformHost = PLATFORM_HOSTS.has(host);

  // 3. Platform Administration Route Guard: strictly allow only on PLATFORM_HOSTS
  if (pathname.startsWith("/platform") && !isPlatformHost) {
    return new NextResponse(
      "Forbidden: Platform administration is restricted to DiracPharma platform domain.",
      {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }

  // 4. Unknown Host: Fail closed in production
  if (!isSushrushaHost && !isPlatformHost) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Invalid or unrecognized host domain.", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  // 4. Sushrusha Client Domain Routing
  if (isSushrushaHost) {
    // Root landing page: / -> /sushrusha
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/sushrusha";
      return NextResponse.rewrite(url);
    }

    // Login page: /login -> /sushrusha/login
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/sushrusha/login";
      return NextResponse.rewrite(url);
    }

    // Forgot password page: /forgot-password -> /sushrusha/forgot-password
    if (pathname === "/forgot-password") {
      const url = request.nextUrl.clone();
      url.pathname = "/sushrusha/forgot-password";
      return NextResponse.rewrite(url);
    }

    // First login / change password page: /change-password -> /sushrusha/change-password
    if (pathname === "/change-password") {
      const url = request.nextUrl.clone();
      url.pathname = "/sushrusha/change-password";
      return NextResponse.rewrite(url);
    }

    // Direct access cleanup: prevent duplicate /sushrusha URLs on client domain
    if (pathname === "/sushrusha") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (pathname === "/sushrusha/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (pathname === "/sushrusha/forgot-password") {
      const url = request.nextUrl.clone();
      url.pathname = "/forgot-password";
      return NextResponse.redirect(url);
    }
    if (pathname === "/sushrusha/change-password") {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }

    // All dashboard and application routes (/dashboard, /logout, etc.) pass through directly
    return NextResponse.next();
  }

  // 5. Platform Domain Routing (pharmapro.diracai.com)
  if (host === "pharmapro.diracai.com") {
    // On production platform domain, prevent direct discovery of client-specific paths
    if (pathname.startsWith("/sushrusha")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|images).*)",
  ],
};

