import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";
import { requireOwnerOrAdmin } from "../../../../lib/requireAuth";
import { validateFields, LIMITS } from "../../../../lib/validation";

// GET - 작품 조회 (삭제된 소설 제외)
export async function GET(
  _req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;

  const result = await db.query(
    `SELECT 
       n.id, n.title, n.description, n.cover_url, n.source_language, 
       n.genre, n.genre_taxonomy, n.is_original, n.serial_status, n.episode_format, n.author_id, n.source,
       u.name as author_name, 
       u.username as author_username
     FROM novels n
     LEFT JOIN users u ON n.author_id = u.id
     WHERE n.id = $1 AND n.deleted_at IS NULL`,
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

// DELETE - 작품 Soft Delete (소유자 OR Admin)
export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  const authResult = await requireOwnerOrAdmin(req, id);
  if (authResult instanceof NextResponse) return authResult;

  await initDb();

  const snapshot = await db.query(
    `SELECT n.id, n.title, n.author_id, 
            (SELECT COUNT(*) FROM episodes e WHERE e.novel_id = n.id) as episode_count
     FROM novels n WHERE n.id = $1 AND n.deleted_at IS NULL`,
    [id]
  );

  if (snapshot.rowCount === 0) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  const novel = snapshot.rows[0];
  console.log(`🗑️ SOFT DELETE NOVEL | ${new Date().toISOString()} | id=${novel.id} | title="${novel.title}" | author=${novel.author_id} | episodes=${novel.episode_count}`);

  await db.query(
    "UPDATE novels SET deleted_at = NOW() WHERE id = $1",
    [id]
  );

  return NextResponse.json({ ok: true });
}

// PATCH - 작품 정보 수정 (소유자 OR Admin)
export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  const authResult = await requireOwnerOrAdmin(req, id);
  if (authResult instanceof NextResponse) return authResult;

  await initDb();

  const body = await req.json();

  // 입력 길이 검증
  const vErr = validateFields([
    { value: body.title, field: "TITLE", max: LIMITS.TITLE },
    { value: body.description, field: "DESCRIPTION", max: LIMITS.DESCRIPTION },
  ]);
  if (vErr) return vErr;

  const allowedFields = ["title", "description", "genre", "genre_taxonomy", "is_original", "serial_status", "episode_format"];
  const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    `UPDATE novels SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING id, title, description, cover_url, source_language, genre, genre_taxonomy, is_original, serial_status, episode_format, source`,
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
