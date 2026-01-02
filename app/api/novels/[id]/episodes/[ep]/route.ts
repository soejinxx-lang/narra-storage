import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../../db";
import { randomUUID } from "crypto";
import { LANGUAGES } from "../../../../../lib/constants";

type EpisodeRow = {
  id: string;
  novel_id: string;
  ep: number;
  title: string | null;
  content: string | null;
};

type TranslationRow = {
  translated_text: string | null;
  status: string | null;
};

// 🔒 번역 대상 언어 (ko 제외)
const TARGET_LANGUAGES = LANGUAGES.filter((l) => l !== "ko");

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
    SELECT id, novel_id, ep, title, content
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
    WHERE episode_id = $1 AND language = $2
    `,
    [row.id, lang]
  );

  if (translationRes.rowCount === 0) {
    return NextResponse.json({
      novelId: id,
      ep: epNumber,
      language: lang,
      status: "PENDING",
      content: null,
    });
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

  const { title, content } = await req.json();

  // 1️⃣ 기존 데이터 제거 (동일 작품 / 동일 화수)
  await db.query(
    `
    DELETE FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, epNumber]
  );

  const episodeId = randomUUID();

  // 2️⃣ episodes 재생성 (원문 저장)
  await db.query(
    `
    INSERT INTO episodes (id, novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [episodeId, id, epNumber, title ?? null, content ?? null]
  );

  // 3️⃣ 번역 상태 PENDING 생성
  for (const lang of TARGET_LANGUAGES) {
    await db.query(
      `
      INSERT INTO episode_translations
        (id, episode_id, language, status)
      VALUES
        ($1, $2, $3, 'PENDING')
      `,
      [randomUUID(), episodeId, lang]
    );
  }

  return NextResponse.json({ ok: true });
}
