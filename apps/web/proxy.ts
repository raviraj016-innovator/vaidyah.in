import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/admin', '/nurse', '/patient'];
const LOGIN_PATHS: Record<string, string> = {
  '/admin': '/admin/login',
  '/nurse': '/nurse/login',
  '/patient': '/patient/login',
};

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const prefix = PROTECTED_PREFIXES.find((p) => pathname.startsWith(p));
  if (!prefix) return NextResponse.next();

  // Skip login pages themselves
  if (pathname.endsWith('/login')) return NextResponse.next();

  const token = request.cookies.get('vaidyah_token')?.value
    || request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    const loginUrl = new URL(LOGIN_PATHS[prefix], request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validate JWT expiry (decode without verification for middleware speed)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) {
      const loginUrl = new URL(LOGIN_PATHS[prefix], request.url);
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    const loginUrl = new URL(LOGIN_PATHS[prefix], request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/nurse/:path*', '/patient/:path*'],
};
