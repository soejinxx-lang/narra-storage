import { NextResponse, NextRequest } from "next/server";
import db from "../../db";

export async function GET(_req: NextRequest) {
  const novels = db.prepare("SELECT * FROM novels").all();
  return NextResponse.json({ novels });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.title) {
    return NextResponse.json(
      { error: "INVALID_NOVEL_DATA" },
      { status: 400 }
    );
  }

  const id = body.id ?? `novel-${Date.now()}`;

  const exists = db
    .prepare("SELECT 1 FROM novels WHERE id = ?")
    .get(id);

  if (exists) {
    return NextResponse.json(
      { error: "NOVEL_ALREADY_EXISTS" },
      { status: 409 }
    );
  }

  db.prepare(
    "INSERT INTO novels (id, title, description) VALUES (?, ?, ?)"
  ).run(id, body.title, body.description ?? "");

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
