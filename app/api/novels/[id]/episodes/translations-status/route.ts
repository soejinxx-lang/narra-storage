import db, { initDb } from "../../../../../db";

export const dynamic = "force-dynamic";

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

  const statuses: Record<
    number,
    Record<string, "PENDING" | "RUNNING" | "DONE" | "FAILED">
  > = {};

  for (const row of result.rows) {
    const ep = row.ep;

    if (!statuses[ep]) {
      statuses[ep] = {};
    }

    if (row.language) {
      statuses[ep][row.language] = row.status;
    }
  }

  return NextResponse.json({ statuses });
}
