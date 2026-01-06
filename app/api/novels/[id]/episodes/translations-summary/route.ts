import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../db";

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
    SELECT
      e.ep,
      t.language,
      t.status
    FROM episodes e
    LEFT JOIN episode_translations t
      ON t.episode_id = e.id
      AND t.is_public = TRUE
    WHERE e.novel_id = $1
    ORDER BY e.ep ASC
    `,
    [id]
  );

  /**
   * EpisodeList가 기대하는 형태:
   * {
   *   1: ["ko", "en"],
   *   2: ["ko"]
   * }
   */
  const summary: Record<number, string[]> = {};

  for (const row of result.rows) {
    const ep = row.ep;

    if (!summary[ep]) {
      summary[ep] = ["ko"]; // 원문은 항상 존재
    }

    // DONE 상태만 포함
    if (row.language && row.status === "DONE") {
      summary[ep].push(row.language);
    }
  }

  return NextResponse.json({ summary });
}
