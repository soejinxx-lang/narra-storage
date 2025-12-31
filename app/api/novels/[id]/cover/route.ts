export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import db, { initDb } from "../../../../db";

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? "ap-northeast-2",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  });
}

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

  const formData = await req.formData();
  const file = formData.get("file");

  // ❗️중요: instanceof File 검사 제거
  if (
    !file ||
    typeof file !== "object" ||
    !("arrayBuffer" in file)
  ) {
    return NextResponse.json(
      { error: "INVALID_FILE" },
      { status: 400 }
    );
  }

  if (!process.env.AWS_S3_BUCKET) {
    return NextResponse.json(
      { error: "S3_BUCKET_NOT_SET" },
      { status: 500 }
    );
  }

  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  ) {
    return NextResponse.json(
      { error: "AWS_CREDENTIALS_NOT_SET" },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(
    await (file as any).arrayBuffer()
  );

  const filename =
    typeof (file as any).name === "string"
      ? (file as any).name
      : "cover";

  const contentType =
    typeof (file as any).type === "string"
      ? (file as any).type
      : "application/octet-stream";

  const key = `covers/${id}-${Date.now()}-${filename}`;

  const s3 = getS3Client();

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "UPLOAD_FAILED" },
      { status: 500 }
    );
  }

  const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return saveCoverUrl(id, publicUrl);
}
