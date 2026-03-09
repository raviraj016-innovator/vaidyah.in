import { NextRequest, NextResponse } from 'next/server';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || process.env.API_GATEWAY_URL || 'http://localhost:3000';

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname; // e.g. /auth/login
  const search = req.nextUrl.search;
  const target = `${AUTH_SERVICE_URL}${path}${search}`;

  const headers = new Headers();
  for (const key of ['authorization', 'content-type', 'accept', 'x-request-id']) {
    const val = req.headers.get(key);
    if (val) headers.set(key, val);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  try {
    const upstream = await fetch(target, init);

    const responseHeaders = new Headers();
    for (const [key, val] of upstream.headers) {
      if (['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) continue;
      responseHeaders.set(key, val);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: { code: 'PROXY_ERROR', message: 'Auth service unreachable' } },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
