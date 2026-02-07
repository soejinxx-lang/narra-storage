import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../db";
import { randomUUID } from "crypto";

// 🔒 Admin 인증 체크 (이 파일 전용)
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

  // 1. (Survival Mode) 목록 조회 시, 시간이 된 잭팟들 일괄 처리!
  // "다른 사람이 안 눌러도 시간이 지나면 올라가도록" -> 목록 조회할 때 업데이트(Lazy Evaluation)
  // 조건: 누군가 1번이라도 읽은(views > 0) 에피소드만 대상으로 함.
  // 가중치: +1 오를 확률이 가장 높고(60%), 대박(Jackpot) 확률은 낮음.
  await db.query(`
    UPDATE episodes
    SET 
      views = views + (
        CASE 
          WHEN random() < 0.6 THEN 1                -- 60% 확률로 1 증가
          WHEN random() < 0.9 THEN floor(random() * 4) + 2  -- 30% 확률로 2~5 증가 (소박)
          ELSE floor(random() * 50) + 10            -- 10% 확률로 10~60 증가 (대박)
        END
      )::int,
      next_jackpot_at = NOW() + (floor(random() * 50 + 10) || ' hours')::interval -- 다음 잭팟은 10~60시간 뒤
    WHERE novel_id = $1 
      AND next_jackpot_at IS NOT NULL 
      AND next_jackpot_at < NOW()
      AND views > 0 -- 중요한 조건: 누군가 발견(클릭)한 에피소드만 자라납니다.
  `, [id]);

  // 2. 초기화 안된(NULL) 잭팟 시간 설정 (나중에 클릭되면 작동하도록 예약만)
  await db.query(`
    UPDATE episodes
    SET next_jackpot_at = NOW() + (floor(random() * 50 + 1) || ' hours')::interval
    WHERE novel_id = $1 AND next_jackpot_at IS NULL
  `, [id]);

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

  // 기존 동일 화수 제거
  await db.query(
    `
    DELETE FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, ep]
  );

  // episodes.id 직접 생성
  const episodeId = randomUUID();

  await db.query(
    `
    INSERT INTO episodes (id, novel_id, ep, title, content, status, scheduled_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [episodeId, id, ep, title, content, status, scheduledAt]
  );

  const LANGUAGES = ["ko", "en", "ja", "zh", "es", "fr", "de", "pt", "id"];

  for (const language of LANGUAGES) {
    await db.query(
      `
      INSERT INTO episode_translations (
        id,
        episode_id,
        language,
        status,
        translated_text
      )
      VALUES ($1, $2, $3, 'PENDING', '')
      `,
      [randomUUID(), episodeId, language]
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
