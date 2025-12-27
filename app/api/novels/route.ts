import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";

export async function GET(_req: NextRequest) {
  await initDb();

  const result = await db.query("SELECT * FROM novels");
  return NextResponse.json({ novels: result.rows });
}

export async function POST(req: NextRequest) {
  await initDb();

  const body = await req.json();

  if (!body?.title) {
    return NextResponse.json(
      { error: "INVALID_NOVEL_DATA" },
      { status: 400 }
    );
  }

  const id = body.id ?? `novel-${Date.now()}`;

  const exists = await db.query(
    "SELECT 1 FROM novels WHERE id = $1",
    [id]
  );

  if (exists.rowCount && exists.rowCount > 0) {
    return NextResponse.json(
      { error: "NOVEL_ALREADY_EXISTS" },
      { status: 409 }
    );
  }

  await db.query(
    "INSERT INTO novels (id, title, description) VALUES ($1, $2, $3)",
    [id, body.title, body.description ?? ""]
  );

  return NextResponse.json(
    {
      novel: {
        id,
        title: body.title,
        description: body.description ?? "",
      },
    },
    { status: 201 }
  );
}
