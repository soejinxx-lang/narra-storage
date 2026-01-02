import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../db";

export async function GET(
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

  // 🔒 에피소드 존재 확인 (번역 유무와 분리)
  const episodeCheck = await db.query(
    `
    SELECT 1
    FROM episodes
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, epNumber]
  );

  if (episodeCheck.rowCount === 0) {
    return NextResponse.json(
      { error: "EPISODE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const result = await db.query(
    `
    SELECT DISTINCT t.language, t.status
    FROM episode_translations t
    JOIN episodes e ON e.id = t.episode_id
    WHERE e.novel_id = $1 AND e.ep = $2
    ORDER BY t.language ASC
    `,
    [id, epNumber]
  );

  const languages = result.rows
    .filter((row) => row.status === "DONE")
    .map((row) => row.language);

  return NextResponse.json({
    novelId: id,
    ep: epNumber,
    languages,
  });
}
