import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";

// 🔒 Admin 인증 체크 (쓰기 전용)
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

// GET /api/novels/[id]/entities (퍼블릭 허용)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await initDb();

  const { id: novelId } = await context.params;

  try {
    const result = await db.query(
      `
      SELECT
        id,
        source_text,
        translation,
        locked,
        category,
        notes,
        created_at,
        updated_at
      FROM entities
      WHERE novel_id = $1
      ORDER BY created_at ASC
      `,
      [novelId]
    );

    return NextResponse.json(result.rows);
  } catch (e: any) {
    return NextResponse.json(
      { error: "FAILED_TO_FETCH_ENTITIES", detail: e.message },
      { status: 500 }
    );
  }
}

// POST /api/novels/[id]/entities (Admin only)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 🔒 쓰기 보호
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  await initDb();

  const { id: novelId } = await context.params;
  const body = await req.json();

  const { source_text, translation, category, notes } = body;

  if (!source_text || !translation) {
    return NextResponse.json(
      { error: "INVALID_BODY" },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `
      INSERT INTO entities
        (novel_id, source_text, translation, locked, category, notes)
      VALUES
        ($1, $2, $3, true, $4, $5)
      RETURNING *
      `,
      [novelId, source_text, translation, category ?? null, notes ?? null]
    );

    return NextResponse.json(result.rows[0]);
  } catch (e: any) {
    if (e.code === "23505") {
      return NextResponse.json(
        { error: "ENTITY_ALREADY_EXISTS" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "FAILED_TO_CREATE_ENTITY", detail: e.message },
      { status: 500 }
    );
  }
}
