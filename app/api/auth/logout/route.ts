import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";

export async function POST(req: NextRequest) {
  try {
    await initDb();

    // 🔒 듀얼 모드: 쿠키 우선, Bearer 폴백
    const cookieToken = req.cookies.get("session")?.value;
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const token = cookieToken || bearerToken;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Delete session
    const result = await db.query(
      "DELETE FROM user_sessions WHERE token = $1",
      [token]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // 🔒 HttpOnly 쿠키 삭제
    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });

    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0, // 즉시 만료
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

