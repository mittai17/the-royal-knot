import { NextResponse, type NextRequest } from 'next/server';

/**
 * Lightweight gate:
 * Exclude public routes (login, magic-link portals, RSVP, legal policies, system status, maintenance, kiosk, error screens).
 * Protected routes require an `access_token` cookie.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/system-status') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/rsvp') ||
    pathname.startsWith('/legal') ||
    pathname.startsWith('/maintenance') ||
    pathname.startsWith('/unauthorized-portal') ||
    pathname.startsWith('/forbidden') ||
    pathname.endsWith('/kiosk') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/socket.io') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/manifest.json';

  if (isPublic) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has('access_token');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
