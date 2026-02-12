import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";
import { requireAdmin } from "../../../lib/admin";
import { isAdmin, getUserIdFromToken } from "../../../lib/auth";

export async function GET(req: NextRequest) {
  await initDb();

  // Check if user is admin
  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));

  // Admin sees everything, non-admin: hide novels where novel OR author is hidden
  let result;
  if (userIsAdmin) {
    result = await db.query(
      `SELECT id, title, description, cover_url, source_language, author_id, genre, is_original, serial_status, episode_format, is_hidden FROM novels`
    );
  } else {
    result = await db.query(
      `SELECT n.id, n.title, n.description, n.cover_url, n.source_language, n.author_id, n.genre, n.is_original, n.serial_status, n.episode_format, n.is_hidden
       FROM novels n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.is_hidden = FALSE
         AND (u.is_hidden = FALSE OR u.is_hidden IS NULL)`
    );
  }
  return NextResponse.json({ novels: result.rows });
}

export async function POST(req: NextRequest) {
  // 🔒 쓰기 API 보호
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  await initDb();

  const body = await req.json();
  console.log("📝 [Novel POST] Request body:", JSON.stringify(body));

  if (!body?.title) {
    console.log("❌ [Novel POST] Missing title");
    return NextResponse.json(
      { error: "INVALID_NOVEL_DATA" },
      { status: 400 }
    );
  }

  const id = body.id ?? `novel-${Date.now()}`;
  const sourceLanguage = body.source_language ?? "ko";

  // ✅ Authorization 헤더에서 작가 ID 자동 추출 (정합성 보장)
  const authHeader = req.headers.get("Authorization");
  console.log("🔑 [Novel POST] Auth header:", authHeader ? "present" : "missing");

  const authorId = await getUserIdFromToken(authHeader);
  console.log("👤 [Novel POST] Extracted author_id:", authorId);

  // 🔒 author_id 필수 (로그인 필수)
  if (!authorId) {
    console.log("❌ [Novel POST] No author_id - returning 401");
    return NextResponse.json(
      { error: "AUTHOR_ID_REQUIRED" },
      { status: 401 }
    );
  }

  const exists = await db.query(
    "SELECT 1 FROM novels WHERE id = $1",
    [id]
  );

  if (exists.rowCount && exists.rowCount > 0) {
    return NextResponse.json(
      { error: "NOVEL_ALREADY_EXISTS" },
      { status: 409 }
    );
  }

  await db.query(
    "INSERT INTO novels (id, title, description, cover_url, source_language, author_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, body.title, body.description ?? "", null, sourceLanguage, authorId]
  );

  return NextResponse.json(
    {
      novel: {
        id,
        title: body.title,
        description: body.description ?? "",
        cover_url: null,
        source_language: sourceLanguage,
        author_id: authorId,
      },
    },
    { status: 201 }
  );
}
