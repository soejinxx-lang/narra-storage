import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../db";
import { randomUUID } from "crypto";
import { requireOwnerOrAdmin, consumeTranslationQuota } from "../../../../../lib/requireAuth";
import { isAdmin } from "../../../../../lib/auth";

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
  const { id } = await params;

  // 소유자 OR Admin 확인
  const authResult = await requireOwnerOrAdmin(req, id);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  await initDb();

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
  const status = scheduledAt ? "scheduled" : "published";

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

  // Admin은 쿼터 없음
  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));

  if (!userIsAdmin) {
    // 번역 쿼터 차감 (atomic)
    // 트랜잭션 순서: quota 차감 → episode insert → translation records
    // quota 차감 실패 시 episode 저장 자체를 막음
    const quotaResult = await consumeTranslationQuota(userId);
    if (quotaResult !== true) {
      return NextResponse.json(
        {
          error: "TRANSLATION_QUOTA_EXCEEDED",
          message: "오늘 번역 횟수를 모두 사용했습니다.",
          resetIn: quotaResult.resetIn,
        },
        { status: 429 }
      );
    }
  }

  // 트랜잭션: 에피소드 + 번역 레코드 원자적 생성
  const client = await db.connect();
  try {
    await client.query("BEGIN");

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

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, episodeId }, { status: 201 });
  } catch (txError) {
    await client.query("ROLLBACK");
    throw txError;
  } finally {
    client.release();
  }
}
