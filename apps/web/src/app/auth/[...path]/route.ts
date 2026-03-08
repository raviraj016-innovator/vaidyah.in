import { NextResponse } from 'next/server';

// Catch-all auth route for standalone mode (no backend configured).
// When API_GATEWAY_URL is set, Next.js rewrites proxy to the real backend instead.

function jsonResponse(body: object, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  return jsonResponse({ error: 'Backend not configured', hint: 'Set API_GATEWAY_URL environment variable' }, 503);
}

export async function POST() {
  return jsonResponse({ error: 'Backend not configured', hint: 'Set API_GATEWAY_URL environment variable' }, 503);
}
