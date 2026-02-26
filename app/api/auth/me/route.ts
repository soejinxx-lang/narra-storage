import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";

export async function GET(req: NextRequest) {
  try {
    await initDb();
    // Get token from Authorization header
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Find valid session
    const sessionResult = await db.query(
      `SELECT 
        us.user_id,
        us.expires_at,
        u.id,
        u.username,
        u.name,
        u.role,
        u.created_at
       FROM user_sessions us
       JOIN users u ON us.user_id = u.id
       WHERE us.token = $1 AND us.expires_at > NOW()`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const user = sessionResult.rows[0];

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Auth verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
