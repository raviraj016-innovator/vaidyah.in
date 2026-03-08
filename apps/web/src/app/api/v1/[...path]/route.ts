import { NextRequest, NextResponse } from 'next/server';

// Catch-all API route for standalone mode (no backend configured).
// When API_GATEWAY_URL is set, Next.js rewrites proxy to the real backend instead.

function jsonResponse(body: object, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === '/api/v1/health') {
    return jsonResponse({ status: 'ok', mode: 'standalone' });
  }
  return jsonResponse({ error: 'Backend not configured', hint: 'Set API_GATEWAY_URL environment variable' }, 503);
}

export async function POST() {
  return jsonResponse({ error: 'Backend not configured', hint: 'Set API_GATEWAY_URL environment variable' }, 503);
}

export async function PUT() {
  return jsonResponse({ error: 'Backend not configured', hint: 'Set API_GATEWAY_URL environment variable' }, 503);
}

export async function DELETE() {
  return jsonResponse({ error: 'Backend not configured', hint: 'Set API_GATEWAY_URL environment variable' }, 503);
}
