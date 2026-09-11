import { NextRequest, NextResponse } from 'next/server';
import { validateLocalRequest } from '@/lib/local-session';

export function proxy(request: NextRequest) {
  const status = validateLocalRequest(request, request.cookies.get('multiw2-session')?.value);
  if (status !== 200) return NextResponse.json({ error: 'Open MultiW2 from the desktop shortcut.' }, { status });
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: '/:path*',
};
