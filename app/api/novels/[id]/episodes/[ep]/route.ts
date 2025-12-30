import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../../../db";

type EpisodeRow = {
  novel_id: string;
  ep: number;
  title: string | null;
  content: string | null;
};

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

  const row = result.rows[0] as EpisodeRow;

  return NextResponse.json({
    novelId: row.novel_id,
    ep: row.ep,
    title: row.title,
    content: row.content,
  });
}

