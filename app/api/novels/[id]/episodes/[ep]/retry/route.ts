import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../../db";

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

  const body = await req.json();
  const { language } = body;

  if (!language || typeof language !== "string") {
    return NextResponse.json(
      { error: "LANGUAGE_REQUIRED" },
      { status: 400 }
    );
  }

  // 1️⃣ episode 조회
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

  const episode = episodeRes.rows[0];
  const episodeId = episode.id;
  const content = episode.content;

  try {
    // 2️⃣ RUNNING으로 변경
    await db.query(
      `
      UPDATE episode_translations
      SET status = 'RUNNING',
          error_message = NULL,
          updated_at = NOW()
      WHERE episode_id = $1 AND language = $2
      `,
      [episodeId, language]
    );

    // 3️⃣ Pipeline 재호출
    const res = await fetch(
      `${PIPELINE_BASE_URL}/translate_episode`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Pin": PIPELINE_ACCESS_PIN,
        },
        body: JSON.stringify({
          novel_title: id,
          text: content,
          language,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`PIPELINE_${res.status}`);
    }

    const data = await res.json();

    // 4️⃣ DONE 처리
    await db.query(
      `
      UPDATE episode_translations
      SET translated_text = $1,
          status = 'DONE',
          updated_at = NOW()
      WHERE episode_id = $2 AND language = $3
      `,
      [data.translated_text, episodeId, language]
    );

    return NextResponse.json({
      language,
      status: "DONE",
    });
  } catch (e: any) {
    // 5️⃣ FAILED 처리
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
