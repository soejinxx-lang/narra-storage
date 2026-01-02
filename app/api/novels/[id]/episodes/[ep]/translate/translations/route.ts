import { NextResponse, NextRequest } from "next/server";
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

  const result = await db.query(
    `
    SELECT language
    FROM episode_translations
    WHERE novel_id = $1 AND ep = $2
    `,
    [id, epNumber]
  );

  return NextResponse.json({
    novelId: id,
    ep: epNumber,
    languages: result.rows.map((r) => r.language),
  });
}
