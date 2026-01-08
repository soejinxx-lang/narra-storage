import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";
import fs from "fs";
import path from "path";

// 🔒 Admin 인증 체크 (쓰기 전용)
const ADMIN_KEY = process.env.ADMIN_API_KEY;

// 🔧 Pipeline entities 파일 경로
const PIPELINE_ENTITIES_DIR =
  process.env.PIPELINE_ENTITIES_DIR || "/app/data/entities";

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
        translations,
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

  const { source_text, translations, category, notes } = body;

  if (!source_text || !translations) {
    return NextResponse.json(
      { error: "INVALID_BODY" },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `
      INSERT INTO entities
        (novel_id, source_text, translations, locked, category, notes)
      VALUES
        ($1, $2, $3, true, $4, $5)
      RETURNING *
      `,
      [novelId, source_text, translations, category ?? null, notes ?? null]
    );

    /**
     * 🔄 DB → Pipeline entities 파일 동기화
     * - Pipeline은 파일 시스템만 참조함
     * - 여기서 단일 진실 소스(DB)를 기준으로 덮어씀
     */
    const allEntitiesRes = await db.query(
      `
      SELECT source_text, translations, locked, category, notes
      FROM entities
      WHERE novel_id = $1
      `,
      [novelId]
    );

    const entityMap: Record<string, any> = {};
    for (const e of allEntitiesRes.rows) {
      entityMap[e.source_text] = {
        translations: e.translations,
        locked: e.locked,
        category: e.category,
        notes: e.notes,
      };
    }

    fs.mkdirSync(PIPELINE_ENTITIES_DIR, { recursive: true });

    const filePath = path.join(
      PIPELINE_ENTITIES_DIR,
      `${novelId}.json`
    );

    fs.writeFileSync(
      filePath,
      JSON.stringify(entityMap, null, 2),
      "utf-8"
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
