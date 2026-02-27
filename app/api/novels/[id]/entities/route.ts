import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";
import { requireOwnerOrAdmin } from "../../../../../lib/requireAuth";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { validateFields, LIMITS } from "../../../../../lib/validation";
import { checkBodySize } from "../../../../../lib/bodyLimit";

// 🔧 Pipeline entities 파일 경로
const PIPELINE_ENTITIES_DIR =
  process.env.PIPELINE_ENTITIES_DIR || "/app/data/entities";


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

    return NextResponse.json({ entities: result.rows });
  } catch (e: any) {
    console.error("FAILED_TO_FETCH_ENTITIES:", e.message);
    return NextResponse.json(
      { error: "FAILED_TO_FETCH_ENTITIES" },
      { status: 500 }
    );
  }
}

// POST /api/novels/[id]/entities (소유자 OR Admin)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Body size 체크
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;

  const { id: novelId } = await context.params;

  // 🔒 소유자 OR Admin 확인
  const authResult = await requireOwnerOrAdmin(req, novelId);
  if (authResult instanceof NextResponse) return authResult;

  await initDb();

  const body = await req.json();

  const { source_text, translations, category, notes } = body;

  if (!source_text || !translations) {
    return NextResponse.json(
      { error: "INVALID_BODY" },
      { status: 400 }
    );
  }

  // 입력 길이 검증
  const validationErr = validateFields([
    { value: source_text, field: "SOURCE_TEXT", max: LIMITS.ENTITY_SOURCE },
  ]);
  if (validationErr) return validationErr;

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
     * - Path traversal 방어: basename + resolve + baseDir 검증
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

    // 🔒 Path traversal 3중 방어
    const safeId = path.basename(novelId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.resolve(PIPELINE_ENTITIES_DIR, `${safeId}.json`);
    const baseDir = path.resolve(PIPELINE_ENTITIES_DIR);

    if (!filePath.startsWith(baseDir + path.sep) && filePath !== path.join(baseDir, `${safeId}.json`)) {
      console.error("Path traversal blocked:", novelId, "→", filePath);
      return NextResponse.json({ error: "INVALID_PATH" }, { status: 400 });
    }

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

    console.error("FAILED_TO_CREATE_ENTITY:", e.message);
    return NextResponse.json(
      { error: "FAILED_TO_CREATE_ENTITY" },
      { status: 500 }
    );
  }
}

