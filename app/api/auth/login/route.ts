import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";
import bcrypt from "bcrypt";
import crypto from "crypto";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
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
      "SELECT id, username, password_hash, name, created_at FROM users WHERE username = $1",
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

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        created_at: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
