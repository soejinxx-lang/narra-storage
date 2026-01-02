import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../../db";

type EpisodeRow = {
  novel_id: string;
  ep: number;
  title: string | null;
  content: string | null;
};

type TranslationRow = {
  translated_text: string;
};

const TARGET_LANGUAGES = [
  "en",
  "ja",
  "zh",
  "es",
  "fr",
  "de",
  "pt",
  "id",
];

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; ep: string }>;
  }
) {
  await initDb();

  const { id, ep } = await params;

  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "ko";

  const result = await db.query(
    `
    SELECT novel_id, ep, title, content
    FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, Number(ep)]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "EPISODE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const row = result.rows[0] as unknown as EpisodeRow;

  if (lang === "ko") {
    return NextResponse.json({
      novelId: row.novel_id,
      ep: row.ep,
      title: row.title,
      content: row.content,
      language: "ko",
    });
  }

  const translationRes = await db.query(
    `
    SELECT translated_text
    FROM episode_translations
    WHERE novel_id = $1 AND ep = $2 AND language = $3
    `,
    [id, Number(ep), lang]
  );

  if (translationRes.rowCount === 0) {
    return NextResponse.json(
      { error: "TRANSLATION_NOT_FOUND", language: lang },
      { status: 404 }
    );
  }

  const translation =
    translationRes.rows[0] as unknown as TranslationRow;

  return NextResponse.json({
    novelId: row.novel_id,
    ep: row.ep,
    title: row.title,
    content: translation.translated_text,
    language: lang,
  });
}

export async function POST(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; ep: string }>;
  }
) {
  await initDb();

  const { id, ep } = await params;

  const pipelineUrl = process.env.PIPELINE_BASE_URL;
  const pipelinePin = process.env.PIPELINE_PIN;

  if (!pipelineUrl || !pipelinePin) {
    return NextResponse.json(
      { error: "PIPELINE_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  const episodeRes = await db.query(
    `
    SELECT content
    FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, Number(ep)]
  );

  if (episodeRes.rowCount === 0) {
    return NextResponse.json(
      { error: "EPISODE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const sourceText = episodeRes.rows[0].content;

  // 🔁 언어별 반복
  for (const lang of TARGET_LANGUAGES) {
    // 1️⃣ 세션 생성
    const sessionRes = await fetch(`${pipelineUrl}/process_text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Pin": pipelinePin,
      },
      body: JSON.stringify({
        novel_title: id,
        text: sourceText,
        target_language: lang,
      }),
    });

    if (!sessionRes.ok) continue;

    const sessionData = await sessionRes.json();
    const sessionId = sessionData.session_id;
    if (!sessionId) continue;

    // 2️⃣ 번역 실행
    const translateRes = await fetch(
      `${pipelineUrl}/process_translate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Pin": pipelinePin,
        },
        body: JSON.stringify({
          session_id: sessionId,
          novel_title: id,
        }),
      }
    );

    if (!translateRes.ok) continue;

    // 3️⃣ 결과 다운로드
    const textRes = await fetch(
      `${pipelineUrl}/download/translated/${sessionId}`,
      {
        headers: {
          "X-Access-Pin": pipelinePin,
        },
      }
    );

    if (!textRes.ok) continue;

    const translatedText = await textRes.text();

    // 4️⃣ 저장
    await db.query(
      `
      INSERT INTO episode_translations
        (novel_id, ep, language, translated_text)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (novel_id, ep, language)
      DO UPDATE SET translated_text = $4
      `,
      [id, Number(ep), lang, translatedText]
    );
  }

  return NextResponse.json({ ok: true });
}
