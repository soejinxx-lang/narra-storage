import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../db";

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

  await db.query(
    `
    DELETE FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, ep]
  );

  const insertResult = await db.query(
    `
    INSERT INTO episodes (novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [id, ep, title, content]
  );

  const episodeId = insertResult.rows[0].id;

  const LANGUAGES = ["en", "ja", "zh", "es", "fr", "de", "pt", "id"];

  for (const language of LANGUAGES) {
    await db.query(
      `
      INSERT INTO episode_translations (episode_id, language, status)
      VALUES ($1, $2, 'PENDING')
      `,
      [episodeId, language]
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
