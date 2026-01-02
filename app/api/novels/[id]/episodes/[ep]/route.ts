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

  // ✅ 언어 파라미터 (기본: 원문)
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "ko";

  // 1️⃣ 기본 에피소드 조회
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

  // 2️⃣ 원문 요청이면 그대로 반환
  if (lang === "ko") {
    return NextResponse.json({
      novelId: row.novel_id,
      ep: row.ep,
      title: row.title,
      content: row.content,
      language: "ko",
    });
  }

  // 3️⃣ 번역본 조회
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

  // 1️⃣ 원문 조회
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

  // 2️⃣ 파이프라인 호출
  const pipelineUrl = process.env.PIPELINE_BASE_URL;
  if (!pipelineUrl) {
    return NextResponse.json(
      { error: "PIPELINE_URL_NOT_SET" },
      { status: 500 }
    );
  }

  const res = await fetch(`${pipelineUrl}/process_translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Pin": process.env.PIPELINE_PIN || "",
    },
    body: JSON.stringify({
      novel_title: id,
      text: sourceText,
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "PIPELINE_FAILED" },
      { status: 500 }
    );
  }

  const data = await res.json();

  if (!data?.translated_text) {
    return NextResponse.json(
      { error: "INVALID_PIPELINE_RESPONSE" },
      { status: 500 }
    );
  }

  // 3️⃣ 번역 저장 (영어 기준 – 다음 단계에서 다국어 확장)
  await db.query(
    `
    INSERT INTO episode_translations
      (novel_id, ep, language, translated_text)
    VALUES
      ($1, $2, $3, $4)
    ON CONFLICT (novel_id, ep, language)
    DO UPDATE SET translated_text = $4
    `,
    [id, Number(ep), "en", data.translated_text]
  );

  return NextResponse.json({ ok: true });
}
