import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../db";
import { randomUUID } from "crypto";
import { requireAdmin } from "../../../../../lib/admin";


export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await params;


  const includeScheduled = _req.nextUrl.searchParams.get("include_scheduled") === "true";

  const result = await db.query(
    `
    SELECT id, ep, title, content, views, created_at, status, scheduled_at
    FROM episodes
    WHERE novel_id = $1
      ${includeScheduled ? "" : "AND (status IS NULL OR status = 'published')"}
    ORDER BY ep ASC
    `,
    [id]
  );

  return NextResponse.json({ episodes: result.rows });
}

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  // 🔒 쓰기 API 보호
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  await initDb();

  const { id } = await params;
  const body = await req.json();

  if (typeof body?.ep !== "number") {
    return NextResponse.json(
      { error: "INVALID_EPISODE_DATA" },
      { status: 400 }
    );
  }

  const ep = body.ep;
  const title = body.title ?? "";
  const content = body.content ?? "";
  const scheduledAt = body.scheduled_at ?? null;
  const status = scheduledAt ? 'scheduled' : 'published';

  // 동일 화수 이미 존재하면 거부
  const existing = await db.query(
    `SELECT id FROM episodes WHERE novel_id = $1 AND ep = $2`,
    [id, ep]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json(
      { error: "EPISODE_ALREADY_EXISTS", message: `Episode ${ep} already exists` },
      { status: 409 }
    );
  }

  // 트랜잭션으로 에피소드 + 번역 레코드 원자적 생성
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // episodes.id 직접 생성
    const episodeId = randomUUID();

    await client.query(
      `INSERT INTO episodes (id, novel_id, ep, title, content, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [episodeId, id, ep, title, content, status, scheduledAt]
    );

    const LANGUAGES = ["ko", "en", "ja", "zh", "es", "fr", "de", "pt", "id"];

    for (const language of LANGUAGES) {
      await client.query(
        `INSERT INTO episode_translations (id, episode_id, language, status, translated_text)
         VALUES ($1, $2, $3, 'PENDING', '')`,
        [randomUUID(), episodeId, language]
      );
    }

    await client.query('COMMIT');
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
