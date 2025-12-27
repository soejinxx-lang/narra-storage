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
    "SELECT ep, title, content FROM episodes WHERE novel_id = $1 ORDER BY ep ASC",
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

  await db.query(
    `
    INSERT INTO episodes (novel_id, ep, title, content)
    VALUES ($1, $2, $3, $4)
    `,
    [
      id,
      body.ep,
      body.title ?? "",
      body.content ?? "",
    ]
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
