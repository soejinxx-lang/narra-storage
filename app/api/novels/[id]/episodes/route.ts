import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../db";
import { randomUUID } from "crypto";

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
    `
    SELECT ep, title, content
    FROM episodes
    WHERE novel_id = $1
    ORDER BY ep ASC
    `,
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

  // 기존 동일 화수 제거
  await db.query(
    `
    DELETE FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, ep]
  );

  // episodes.id 직접 생성
  const episodeId = randomUUID();

  await db.query(
    `
    INSERT INTO episodes (id, novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [episodeId, id, ep, title, content]
  );

  const LANGUAGES = ["en", "ja", "zh", "es", "fr", "de", "pt", "id"];

  for (const language of LANGUAGES) {
    await db.query(
      `
      INSERT INTO episode_translations (
        id,
        episode_id,
        language,
        status,
        translated_text
      )
      VALUES ($1, $2, $3, 'PENDING', '')
      `,
      [randomUUID(), episodeId, language]
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
