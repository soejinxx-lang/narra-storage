import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";
import bcrypt from "bcrypt";
import crypto from "crypto";

// 🔒 허용 도메인 (CSRF + CORS)
const ALLOWED_ORIGINS = [
  "https://www.narra.kr",
  "https://narra.kr",
  "http://localhost:3000",
  "http://localhost:3001",
];

// CORS headers — 특정 도메인만 허용 + credentials
function getCorsHeaders(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  try {
    // 🔒 CSRF: Origin 검증 (쿠키 기반 인증에 대비)
    const origin = req.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return NextResponse.json(
        { error: "FORBIDDEN_ORIGIN" },
        { status: 403 }
      );
    }

    await initDb();
    const { username, password } = await req.json();

    // Validation
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Find user
    const userResult = await db.query(
      "SELECT id, username, password_hash, name, role, created_at FROM users WHERE username = $1",
      [username]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    // Create session
    await db.query(
      `INSERT INTO user_sessions (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    // 🔒 HttpOnly 쿠키 설정 (1단계: 듀얼 모드 — 쿠키 + JSON 토큰 둘 다)
    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          created_at: user.created_at,
        },
        token, // 하위 호환: 기존 클라이언트 localStorage 지원
      },
      { headers: getCorsHeaders(req) }
    );

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30일
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

