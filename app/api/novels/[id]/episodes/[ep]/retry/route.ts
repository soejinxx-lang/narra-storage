import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../db";
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
  await initDb();

  const authResult = await requireOwnerOrAdmin(req, id);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  const epNumber = Number(ep);

  if (Number.isNaN(epNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const { language } = await req.json();

  if (!language) {
    return NextResponse.json(
      { error: "LANGUAGE_REQUIRED" },
      { status: 400 }
    );
  }

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

  // Author는 쿼터 차감
  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));
  if (!userIsAdmin) {
    const quotaResult = await consumeTranslationQuota(userId);
    if (quotaResult !== true) {
      return NextResponse.json(
        { error: "TRANSLATION_QUOTA_EXCEEDED", resetIn: quotaResult.resetIn },
        { status: 429 }
      );
    }
  }

  try {
    await db.query(
      `UPDATE episode_translations
       SET status = 'PENDING', error_message = NULL, error_type = NULL,
           quota_refunded = FALSE, updated_at = NOW()
       WHERE episode_id = $1 AND language = $2`,
      [episodeId, language]
    );

    return NextResponse.json({ language, status: "PENDING" });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await db.query(
      `UPDATE episode_translations
       SET status = 'FAILED', error_message = $1, updated_at = NOW()
       WHERE episode_id = $2 AND language = $3`,
      [message, episodeId, language]
    );

    return NextResponse.json({
      language,
      status: "FAILED",
      error: message,
    });
  }
}

