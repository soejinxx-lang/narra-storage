import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";

// 🔒 Admin 인증 체크 (이 파일 전용, 구조 변경 없음)
const ADMIN_KEY = process.env.ADMIN_API_KEY;

function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!ADMIN_KEY || auth !== `Bearer ${ADMIN_KEY}`) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
}

export async function GET(_req: NextRequest) {
  await initDb();

  const result = await db.query("SELECT * FROM novels");
  return NextResponse.json({ novels: result.rows });
}

export async function POST(req: NextRequest) {
  // 🔒 쓰기 API 보호
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  await initDb();

  const body = await req.json();

  if (!body?.title) {
    return NextResponse.json(
      { error: "INVALID_NOVEL_DATA" },
      { status: 400 }
    );
  }

  const id = body.id ?? `novel-${Date.now()}`;
  const sourceLanguage = body.source_language ?? "ko";
  const authorId = body.author_id ?? null;

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
