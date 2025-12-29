export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  await initDb();

  const { id } = await context.params;

  const body = await req.json();
  const { coverUrl } = body;

  if (!coverUrl || typeof coverUrl !== "string") {
    return NextResponse.json(
      { error: "INVALID_COVER_URL" },
      { status: 400 }
    );
  }

  await db.query(
    "UPDATE novels SET cover_url = $1 WHERE id = $2",
    [coverUrl, id]
  );

  return NextResponse.json({ cover_url: coverUrl });
}
