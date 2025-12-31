export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";

async function saveCoverUrl(id: string, url: string) {
  const result = await db.query(
    "UPDATE novels SET cover_url = $1 WHERE id = $2 RETURNING id",
    [url, id]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json({ cover_url: url }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const coverUrl = body?.coverUrl;

  if (!coverUrl || typeof coverUrl !== "string") {
    return NextResponse.json(
      { error: "INVALID_COVER_URL" },
      { status: 400 }
    );
  }

  return saveCoverUrl(id, coverUrl);
}
