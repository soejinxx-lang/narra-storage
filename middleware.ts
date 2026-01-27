import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const ip = request.ip || '127.0.0.1';

  // 1. Rate Limiting (Simple In-Memory)
  // 10초에 20번 이상 요청시 차단 (도배 방지)
  if (!globalThis.rateLimitMap) {
    globalThis.rateLimitMap = new Map();
  }

  const now = Date.now();
  const windowMs = 10 * 1000; // 10 seconds
  const limit = 20;

  const record = globalThis.rateLimitMap.get(ip) || { count: 0, startTime: now };

  if (now - record.startTime > windowMs) {
    // Reset window
    record.count = 1;
    record.startTime = now;
  } else {
    record.count++;
  }

  globalThis.rateLimitMap.set(ip, record);

  if (record.count > limit) {
    return new NextResponse(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. CORS Handling
  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Add CORS headers to all responses
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  return response;
}

// Apply middleware to API routes only
export const config = {
  matcher: '/api/:path*',
};
