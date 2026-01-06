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
      t.status,
      n.source_language
    FROM episodes e
    JOIN novels n
      ON n.id = e.novel_id
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
   *   1: ["ja", "en"],
   *   2: ["ja"]
   * }
   */
  const summary: Record<number, string[]> = {};

  for (const row of result.rows) {
    const ep = row.ep;
    const sourceLanguage = row.source_language;

    if (!summary[ep]) {
      summary[ep] = [sourceLanguage]; // ✅ 원문 언어
    }

    // DONE 상태만 포함
    if (row.language && row.status === "DONE") {
      summary[ep].push(row.language);
    }
  }

  return NextResponse.json({ summary });
}
