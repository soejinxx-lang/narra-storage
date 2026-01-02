import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../../db";

type EpisodeRow = {
  novel_id: string;
  ep: number;
  title: string | null;
  content: string | null;
};

type TranslationRow = {
  translated_text: string | null;
  status: string | null;
};

// 🔒 고정 언어 8개 (최종)
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
  const epNumber = Number(ep);

  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "ko";

  // 1️⃣ 원문 조회
  const result = await db.query(
    `
    SELECT novel_id, ep, title, content
    FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, epNumber]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "EPISODE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const row = result.rows[0] as unknown as EpisodeRow;

  // 2️⃣ 원문 요청
  if (lang === "ko") {
    return NextResponse.json({
      novelId: row.novel_id,
      ep: row.ep,
      title: row.title,
      content: row.content,
      language: "ko",
      status: "DONE",
    });
  }

  // 3️⃣ 번역 조회
  const translationRes = await db.query(
    `
    SELECT translated_text, status
    FROM episode_translations
    WHERE novel_id = $1 AND ep = $2 AND language = $3
    `,
    [id, epNumber, lang]
  );

  if (translationRes.rowCount === 0) {
    return NextResponse.json(
      {
        novelId: id,
        ep: epNumber,
        language: lang,
        status: "PENDING",
        content: null,
      },
      { status: 200 }
    );
  }

  const translation =
    translationRes.rows[0] as unknown as TranslationRow;

  if (translation.status !== "DONE") {
    return NextResponse.json({
      novelId: id,
      ep: epNumber,
      language: lang,
      status: translation.status ?? "PENDING",
      content: null,
    });
  }

  return NextResponse.json({
    novelId: id,
    ep: epNumber,
    title: row.title,
    content: translation.translated_text,
    language: lang,
    status: "DONE",
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
  const epNumber = Number(ep);

  const pipelineUrl = process.env.PIPELINE_BASE_URL;
  const pipelinePin = process.env.PIPELINE_PIN;

  if (!pipelineUrl || !pipelinePin) {
    return NextResponse.json(
      { error: "PIPELINE_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  // 1️⃣ 원문 조회
  const episodeRes = await db.query(
    `
    SELECT content
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

  const sourceText = episodeRes.rows[0].content;

  // 2️⃣ 기존 번역 상태 조회
  const existingRes = await db.query(
    `
    SELECT language, status
    FROM episode_translations
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, epNumber]
  );

  const statusMap: Record<string, string> = {};
  for (const row of existingRes.rows) {
    statusMap[row.language] = row.status;
  }

  // 3️⃣ 언어별 처리
  for (const lang of TARGET_LANGUAGES) {
    // ✅ 이미 DONE이면 스킵
    if (statusMap[lang] === "DONE") {
      continue;
    }

    // RUNNING 상태로 업서트
    await db.query(
      `
      INSERT INTO episode_translations
        (novel_id, ep, language, translated_text, status)
      VALUES
        ($1, $2, $3, NULL, 'RUNNING')
      ON CONFLICT (novel_id, ep, language)
      DO UPDATE SET status = 'RUNNING'
      `,
      [id, epNumber, lang]
    );

    try {
      // 4️⃣ 세션 생성
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

      if (!sessionRes.ok) throw new Error("SESSION_FAILED");

      const sessionData = await sessionRes.json();
      const sessionId = sessionData.session_id;
      if (!sessionId) throw new Error("NO_SESSION_ID");

      // 5️⃣ 번역 실행
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

      if (!translateRes.ok) throw new Error("TRANSLATE_FAILED");

      // 6️⃣ 결과 다운로드
      const textRes = await fetch(
        `${pipelineUrl}/download/translated/${sessionId}`,
        {
          headers: {
            "X-Access-Pin": pipelinePin,
          },
        }
      );

      if (!textRes.ok) throw new Error("DOWNLOAD_FAILED");

      const translatedText = await textRes.text();

      // 7️⃣ DONE 처리
      await db.query(
        `
        UPDATE episode_translations
        SET translated_text = $4, status = 'DONE'
        WHERE novel_id = $1 AND ep = $2 AND language = $3
        `,
        [id, epNumber, lang, translatedText]
      );
    } catch {
      // ❌ FAILED 처리
      await db.query(
        `
        UPDATE episode_translations
        SET status = 'FAILED'
        WHERE novel_id = $1 AND ep = $2 AND language = $3
        `,
        [id, epNumber, lang]
      );
    }
  }

  return NextResponse.json({ ok: true });
}
