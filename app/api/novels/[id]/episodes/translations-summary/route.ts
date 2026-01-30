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
   *   1: { "ja": "DONE", "en": "DONE", "ko": "FAILED" },
   *   2: { "ja": "DONE", "en": "PROCESSING" }
   * }
   */
  const summary: Record<number, Record<string, string>> = {};

  for (const row of result.rows) {
    const ep = row.ep;
    const sourceLanguage = row.source_language;

    if (!summary[ep]) {
      summary[ep] = {};
      summary[ep][sourceLanguage] = "DONE"; // ✅ 원문 언어는 항상 DONE
    }

    // 모든 번역 상태 포함
    if (row.language && row.status) {
      summary[ep][row.language] = row.status;
    }
  }

  return NextResponse.json({ summary });
}
