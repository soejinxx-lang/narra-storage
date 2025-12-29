export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

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

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: filename,
        Body: buffer,
        ContentType: file.type,
      })
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "UPLOAD_FAILED" },
      { status: 500 }
    );
  }

  const publicUrl = `${process.env.R2_PUBLIC_BASE_URL}/${filename}`;

  await db.query(
    "UPDATE novels SET cover_url = $1 WHERE id = $2",
    [publicUrl, id]
  );

  return NextResponse.json({ cover_url: publicUrl });
}
