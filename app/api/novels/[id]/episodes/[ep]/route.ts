import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../../db";

type EpisodeRow = {
  novel_id: string;
  ep: number;
  title: string | null;
  content: string | null;
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

  return NextResponse.json({
    novelId: row.novel_id,
    ep: row.ep,
    title: row.title,
    content: translationRes.rows[0].translated_text,
    language: lang,
  });
}
