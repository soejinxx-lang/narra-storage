import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";

// GET - 작품 조회
export async function GET(
  _req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;

  const result = await db.query(
    "SELECT id, title, description, cover_url, source_language, genre, is_original, serial_status FROM novels WHERE id = $1",
    [id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json(result.rows[0]);
}

// DELETE - 작품 삭제
export async function DELETE(
  _req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;

  const result = await db.query(
    "DELETE FROM novels WHERE id = $1",
    [id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

// PATCH - 작품 정보 수정
export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;
  const body = await req.json();

  // 동적으로 업데이트할 필드 구성
  const allowedFields = ["description", "genre", "is_original", "serial_status"];
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(body[field]);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
  }

  values.push(id);

  const result = await db.query(
    `UPDATE novels SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING id, title, description, cover_url, source_language, genre, is_original, serial_status`,
    values
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json(result.rows[0]);
}
