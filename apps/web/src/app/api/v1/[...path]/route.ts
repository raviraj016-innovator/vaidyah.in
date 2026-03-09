import { NextRequest, NextResponse } from 'next/server';

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname; // e.g. /api/v1/centers
  const search = req.nextUrl.search; // e.g. ?page=1&limit=20
  const target = `${API_GATEWAY_URL}${path}${search}`;

  const headers = new Headers();
  // Forward relevant headers
  for (const key of ['authorization', 'content-type', 'accept', 'x-request-id']) {
    const val = req.headers.get(key);
    if (val) headers.set(key, val);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // For multipart uploads, pass the raw body and let content-type header handle it
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      init.body = await req.arrayBuffer();
    } else {
      init.body = await req.text();
    }
  }

  try {
    const upstream = await fetch(target, init);

    // Pass through the upstream response as-is (status, headers, body)
    const responseHeaders = new Headers();
    for (const [key, val] of upstream.headers) {
      // Skip hop-by-hop headers
      if (['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) continue;
      responseHeaders.set(key, val);
    }

    // Log backend errors for debugging (do not expose details to client)
    if (upstream.status >= 500) {
      const body = await upstream.text();
      console.error(`[Proxy] Backend ${upstream.status} on ${req.method} ${path}:`, body.slice(0, 500));
      return NextResponse.json(
        JSON.parse(body || '{"success":false,"error":{"code":"BACKEND_ERROR","message":"Internal server error"}}'),
        { status: upstream.status, headers: responseHeaders },
      );
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[Proxy] Unreachable ${req.method} ${path}:`, (err as Error).message);
    return NextResponse.json(
      { success: false, error: { code: 'PROXY_ERROR', message: 'Backend unreachable' } },
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
