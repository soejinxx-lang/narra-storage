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
  const contentType = req.headers.get("content-type") ?? "";

  // 1) JSON 입력: { coverUrl }
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const coverUrl = body?.coverUrl;

    if (!coverUrl || typeof coverUrl !== "string") {
      return NextResponse.json(
        { error: "INVALID_COVER_URL" },
        { status: 400 }
      );
    }

    return saveCoverUrl(id, coverUrl);
  }

  // 2) multipart/form-data 입력: file 업로드 후 URL 저장
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
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

  const s3 = getS3Client();
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `covers/${id}-${Date.now()}-${file.name}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ACL: "public-read",
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
