import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";

// GET /api/novels/[id]/entities
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await initDb();

  const novelId = params.id;

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

// POST /api/novels/[id]/entities
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await initDb();

  const novelId = params.id;
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
    // UNIQUE(novel_id, source_text) 충돌
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
