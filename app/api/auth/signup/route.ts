import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
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
    const { username, password, name } = await req.json();

    // Validation
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if username already exists
    const existingUser = await db.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409, headers: corsHeaders }
      );
    }

    // Check if nickname already exists
    if (name) {
      const existingName = await db.query(
        "SELECT id FROM users WHERE name = $1",
        [name]
      );

      if (existingName.rows.length > 0) {
        return NextResponse.json(
          { error: "Nickname already exists" },
          { status: 409, headers: corsHeaders }
        );
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await db.query(
      `INSERT INTO users (username, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, username, name, created_at`,
      [username, passwordHash, name || null]
    );

    const user = userResult.rows[0];

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
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
