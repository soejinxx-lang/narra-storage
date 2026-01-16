import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../db";
import { LANGUAGES } from "../../../../../../lib/constants";

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

const TARGET_LANGUAGES = LANGUAGES.filter((l) => l !== "ko");

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; ep: string }>;
  }
) {
  // 🔒 쓰기 API 보호
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  await initDb();

  const { id, ep } = await params;
  const epNumber = Number(ep);

  if (Number.isNaN(epNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const episodeRes = await db.query(
    `
    SELECT id, content
    FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, epNumber]
  );

  if (episodeRes.rowCount === 0) {
    return NextResponse.json(
      { error: "EPISODE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const { id: episodeId, content } = episodeRes.rows[0];

  // 🔥 Worker 아키텍처: 번역 실행 안 함, 작업만 등록
  // Worker가 PENDING 작업을 폴링하여 순차 처리
  for (const language of TARGET_LANGUAGES) {
    await db.query(
      `
      INSERT INTO episode_translations (id, episode_id, language, status)
      VALUES (gen_random_uuid()::text, $1, $2, 'PENDING')
      ON CONFLICT (episode_id, language)
      DO UPDATE SET
        status = 'PENDING',
        error_message = NULL,
        updated_at = NOW()
      `,
      [episodeId, language]
    );
  }

  console.log(`[translate-all] Queued ${TARGET_LANGUAGES.length} translations for ${id}/${epNumber}`);

  return NextResponse.json({ 
    status: "STARTED",
    message: "Translation jobs queued for worker" 
  });
}
