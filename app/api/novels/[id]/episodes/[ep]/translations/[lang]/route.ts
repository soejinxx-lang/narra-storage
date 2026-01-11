import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../../db";

// 🔒 Admin 인증 체크
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

/**
 * 번역 공개 상태 변경
 * PATCH /api/novels/:id/episodes/:ep/translations/:lang
 */
export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; ep: string; lang: string }>;
  }
) {
  // 🔒 쓰기 보호
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  await initDb();

  try {
    const { id: novelId, ep: epStr, lang } = await params;
    const ep = Number(epStr);

    if (isNaN(ep)) {
      return NextResponse.json(
        { error: "INVALID_EPISODE_NUMBER" },
        { status: 400 }
      );
    }

    let body: { is_public: boolean };
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json(
        { error: "INVALID_JSON", message: String(e) },
        { status: 400 }
      );
    }

    const { is_public } = body;

    if (typeof is_public !== "boolean") {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", message: "is_public must be boolean" },
        { status: 400 }
      );
    }

    console.log(`[Translation Toggle] Novel: ${novelId}, EP: ${ep}, Lang: ${lang}, Public: ${is_public}`);

    // episode_id 조회
    const episodeResult = await db.query(
      `SELECT id FROM episodes WHERE novel_id = $1 AND ep = $2`,
      [novelId, ep]
    );

    if (episodeResult.rows.length === 0) {
      return NextResponse.json(
        { error: "EPISODE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const episodeId = episodeResult.rows[0].id;

    // is_public 업데이트
    const result = await db.query(
      `
      UPDATE episode_translations
      SET is_public = $1, updated_at = NOW()
      WHERE episode_id = $2 AND language = $3
      RETURNING id, language, is_public, status
      `,
      [is_public, episodeId, lang]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "TRANSLATION_NOT_FOUND", message: "Translation does not exist" },
        { status: 404 }
      );
    }

    console.log(`[Translation Toggle] Success:`, result.rows[0]);

    return NextResponse.json({
      ok: true,
      translation: result.rows[0],
    });
  } catch (error) {
    console.error("[Translation Toggle] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
