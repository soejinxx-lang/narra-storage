import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../db";

// ✅ 고정 번역 언어 (B안)
const TRANSLATION_LANGUAGES = [
  "en",
  "ja",
  "zh",
  "es",
  "pt",
  "fr",
  "de",
];

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

  const result = await db.query(
    "SELECT ep, title, content FROM episodes WHERE novel_id = $1 ORDER BY ep ASC",
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

  // 1️⃣ 원문 에피소드 저장 (기존 로직 유지)
  await db.query(
    `
    INSERT INTO episodes (novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4)
    `,
    [id, ep, title, content]
  );

  // 2️⃣ 번역 파이프라인 호출 (언어별, 실패 허용)
  const pipelineBaseUrl = process.env.PIPELINE_BASE_URL;
  const pipelinePin = process.env.PIPELINE_PIN;

  if (pipelineBaseUrl && pipelinePin) {
    for (const language of TRANSLATION_LANGUAGES) {
      try {
        const res = await fetch(`${pipelineBaseUrl}/translate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Pin": pipelinePin,
          },
          body: JSON.stringify({
            novel_title: id,
            text: content,
            language,
          }),
        });

        if (!res.ok) {
          continue;
        }

        const data = await res.json();
        const translatedText = data?.translated_text;

        if (typeof translatedText !== "string") {
          continue;
        }

        // 3️⃣ 번역 결과 저장
        await db.query(
          `
          INSERT INTO episode_translations (novel_id, ep, language, translated_text)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (novel_id, ep, language)
          DO UPDATE SET translated_text = EXCLUDED.translated_text
          `,
          [id, ep, language, translatedText]
        );
      } catch {
        // ❗ 번역 실패는 무시 (에피소드 생성은 성공해야 함)
        continue;
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
