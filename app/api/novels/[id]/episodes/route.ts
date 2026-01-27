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
  // "다른 사람이 안 눌러도 시간이 지나면 올라가도록" -> 목록 조회할 때 업데이트 치면 됨.
  await db.query(`
    UPDATE episodes
    SET 
      views = views + floor(random() * 10 + 1)::int, -- 1~10 랜덤 증가 (리스트 조회는 빈번하므로 조금만 증가)
      next_jackpot_at = NOW() + (floor(random() * 50 + 10) || ' hours')::interval -- 10~60시간 뒤 재설정
    WHERE novel_id = $1 
      AND next_jackpot_at IS NOT NULL 
      AND next_jackpot_at < NOW()
  `, [id]);

  // 2. 초기화 안된(NULL) 잭팟 시간 설정
  await db.query(`
    UPDATE episodes
    SET next_jackpot_at = NOW() + (floor(random() * 50 + 1) || ' hours')::interval
    WHERE novel_id = $1 AND next_jackpot_at IS NULL
  `, [id]);

  const result = await db.query(
    `
    SELECT id, ep, title, content, views, created_at
    FROM episodes
    WHERE novel_id = $1
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
    INSERT INTO episodes (id, novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [episodeId, id, ep, title, content]
  );

  const LANGUAGES = ["en", "ja", "zh", "es", "fr", "de", "pt", "id"];

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
