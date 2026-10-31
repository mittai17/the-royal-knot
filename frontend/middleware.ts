import { NextResponse, type NextRequest } from 'next/server';

/** Lightweight gate: anything without an auth cookie goes to /login. Real validation happens in the API. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('access_token');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!login|system-status|api|socket.io|_next|favicon.ico).*)'] };
