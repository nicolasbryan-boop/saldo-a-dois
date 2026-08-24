import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Cheap gate in front of the authenticated area.
 *
 * This only looks for the presence of a session cookie — it does not validate
 * it and it is NOT the security boundary. Its job is to avoid rendering a
 * whole app shell for a signed-out visitor. Every real check happens in
 * `getAppContext()` on the server, against the database.
 */
const PROTECTED = ['/app', '/onboarding', '/admin', '/trocar-senha'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const cookie = getSessionCookie(request);
  if (cookie) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/entrar';
  url.search = `?proximo=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/app/:path*', '/onboarding/:path*', '/admin/:path*', '/trocar-senha'],
};
