import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../db";
import { requireAdmin } from "../../../../../../../lib/admin";


const PIPELINE_BASE_URL = process.env.PIPELINE_BASE_URL;
const PIPELINE_ACCESS_PIN = process.env.PIPELINE_ACCESS_PIN;

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

  if (!PIPELINE_BASE_URL || !PIPELINE_ACCESS_PIN) {
    return NextResponse.json(
      { error: "PIPELINE_ENV_NOT_SET" },
      { status: 500 }
    );
  }

  const { id, ep } = await params;
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

  try {
    await db.query(
      `
      UPDATE episode_translations
      SET status = 'PENDING',
          error_message = NULL,
          updated_at = NOW()
      WHERE episode_id = $1 AND language = $2
      `,
      [episodeId, language]
    );

    // Worker Migration:
    // 직접 호출하지 않고 PENDING 상태만 남기고 즉시 리턴
    // 실제 번역은 Worker가 처리함
    return NextResponse.json({ language, status: "PENDING" });

  } catch (e: any) {
    await db.query(
      `
      UPDATE episode_translations
      SET status = 'FAILED',
          error_message = $1,
          updated_at = NOW()
      WHERE episode_id = $2 AND language = $3
      `,
      [e.message, episodeId, language]
    );

    return NextResponse.json({
      language,
      status: "FAILED",
      error: e.message,
    });
  }
}
