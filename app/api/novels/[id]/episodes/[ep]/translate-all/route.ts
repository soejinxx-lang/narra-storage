import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../db";
import { LANGUAGES } from "../../../../../../lib/constants";
import { requireOwnerOrAdmin, consumeTranslationQuota } from "../../../../../../../lib/requireAuth";
import { isAdmin } from "../../../../../../../lib/auth";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; ep: string }>;
  }
) {
  const { id, ep } = await params;

  // 🔒 소유자 OR Admin
  const authResult = await requireOwnerOrAdmin(req, id);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  await initDb();

  const epNumber = Number(ep);

  if (Number.isNaN(epNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  // 소설의 원문 언어 조회
  const novelRes = await db.query(
    `SELECT source_language FROM novels WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (novelRes.rowCount === 0) {
    return NextResponse.json({ error: "NOVEL_NOT_FOUND" }, { status: 404 });
  }
  const srcLang = novelRes.rows[0].source_language ?? "ko";
  const TARGET_LANGUAGES = LANGUAGES.filter((l) => l !== srcLang);

  const episodeRes = await db.query(
    `SELECT id FROM episodes WHERE novel_id = $1 AND ep = $2`,
    [id, epNumber]
  );

  if (episodeRes.rowCount === 0) {
    return NextResponse.json(
      { error: "EPISODE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const { id: episodeId } = episodeRes.rows[0];
  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));

  if (userIsAdmin) {
    // Admin: 전체 언어 리셋
    for (const language of TARGET_LANGUAGES) {
      await db.query(
        `INSERT INTO episode_translations (id, episode_id, language, status)
         VALUES (gen_random_uuid(), $1, $2, 'PENDING')
         ON CONFLICT (episode_id, language)
         DO UPDATE SET status = 'PENDING', error_message = NULL, error_type = NULL, updated_at = NOW()`,
        [episodeId, language]
      );
    }
    console.log(`[translate-all] Admin: queued ${TARGET_LANGUAGES.length} translations for ${id}/${epNumber}`);
  } else {
    // Author: FAILED인 언어만 재등록 + 쿼터 차감
    const failedRes = await db.query(
      `SELECT language FROM episode_translations
       WHERE episode_id = $1 AND status = 'FAILED'`,
      [episodeId]
    );

    if (failedRes.rowCount === 0) {
      return NextResponse.json(
        { error: "NO_FAILED_TRANSLATIONS", message: "재시도할 실패 번역이 없습니다." },
        { status: 400 }
      );
    }

    // 쿼터 차감
    const quotaResult = await consumeTranslationQuota(userId);
    if (quotaResult !== true) {
      return NextResponse.json(
        { error: "TRANSLATION_QUOTA_EXCEEDED", resetIn: quotaResult.resetIn },
        { status: 429 }
      );
    }

    await db.query(
      `UPDATE episode_translations
       SET status = 'PENDING', error_message = NULL, error_type = NULL, quota_refunded = FALSE, updated_at = NOW()
       WHERE episode_id = $1 AND status = 'FAILED'`,
      [episodeId]
    );
    console.log(`[translate-all] Author: re-queued ${failedRes.rowCount} FAILED translations for ${id}/${epNumber}`);
  }

  return NextResponse.json({
    status: "STARTED",
    message: "Translation jobs queued for worker"
  });
}

