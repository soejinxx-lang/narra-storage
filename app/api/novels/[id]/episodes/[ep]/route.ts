import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../../db";
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
  is_public: boolean | null;
};

// 🔒 번역 대상 언어 (ko 제외)
const TARGET_LANGUAGES = LANGUAGES.filter((l) => l !== "ko");

/* =========================
   GET (퍼블릭 노출 필터 반영)
========================= */
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

  if (Number.isNaN(epNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "ko";

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

  const row = result.rows[0] as EpisodeRow;

  // 원문(ko)은 항상 노출
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

  const translationRes = await db.query(
    `
    SELECT translated_text, status, is_public
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

  const translation = translationRes.rows[0] as TranslationRow;

  // ❌ 퍼블릭 비노출이면 DONE이어도 숨김
  if (translation.is_public === false) {
    return NextResponse.json({
      novelId: id,
      ep: epNumber,
      language: lang,
      status: "PENDING",
      content: null,
    });
  }

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

/* =========================
   POST (구조 확정 반영)
========================= */
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

  if (Number.isNaN(epNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const { title, content } = await req.json();

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "CONTENT_REQUIRED" },
      { status: 400 }
    );
  }

  const episodeId = `${id}_${epNumber}`;

  await db.query(
    `
    INSERT INTO episodes (id, novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (novel_id, ep)
    DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content
    `,
    [episodeId, id, epNumber, title ?? null, content]
  );

  for (const lang of TARGET_LANGUAGES) {
    await db.query(
      `
      INSERT INTO episode_translations
        (episode_id, language, status, updated_at)
      VALUES
        ($1, $2, 'PENDING', NOW())
      ON CONFLICT (episode_id, language)
      DO NOTHING
      `,
      [episodeId, lang]
    );
  }

  return NextResponse.json({ status: "SAVED" });
}

/* =========================
   DELETE (변경 없음)
========================= */
export async function DELETE(
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

  if (Number.isNaN(epNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const result = await db.query(
    `
    DELETE FROM episodes
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

  return NextResponse.json({ ok: true });
}
