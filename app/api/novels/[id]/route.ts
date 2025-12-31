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
    "SELECT id, title, description, cover_url, genre FROM novels WHERE id = $1",
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

// PATCH - 작품 정보 수정 (genre, description 추가)
export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;
  
  // Request body에서 genre, description을 받음
  const { genre, description } = await req.json();

  const result = await db.query(
    "UPDATE novels SET genre = $1, description = $2 WHERE id = $3 RETURNING id, title, genre, description, cover_url",
    [genre, description, id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json(result.rows[0]);
}
