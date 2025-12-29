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

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "INVALID_FILE" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const filename = `covers/${id}-${Date.now()}-${file.name}`;
  const uploadUrl = `${process.env.R2_PUBLIC_BASE_URL}/${filename}`;

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "Authorization": `Bearer ${process.env.R2_API_TOKEN}`,
    },
    body: buffer,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "UPLOAD_FAILED" },
      { status: 500 }
    );
  }

  await db.query(
    "UPDATE novels SET cover_url = $1 WHERE id = $2",
    [uploadUrl, id]
  );

  return NextResponse.json({ cover_url: uploadUrl });
}
