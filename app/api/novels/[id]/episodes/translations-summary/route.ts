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
    WHERE e.novel_id = $1
    ORDER BY e.ep ASC
    `,
    [id]
  );

  /**
   * 결과 형태:
   * {
   *   1: { en: "DONE", ja: "PENDING" },
   *   2: { en: "DONE" }
   * }
   */
  const summary: Record<
    number,
    Record<string, "PENDING" | "RUNNING" | "DONE" | "FAILED">
  > = {};

  for (const row of result.rows) {
    const ep = row.ep;

    if (!summary[ep]) {
      summary[ep] = {};
    }

    if (row.language) {
      summary[ep][row.language] = row.status;
    }
  }

  return NextResponse.json({ summary });
}
