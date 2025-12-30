export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// [복구] 소설 정보를 가져오는 GET 요청
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await context.params;
  try {
    const result = await db.query("SELECT * FROM novels WHERE id = $1", [id]);
    return NextResponse.json(result.rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: "GET_FAILED", detail: e.message }, { status: 500 });
  }
}

// [수정] 이미지를 S3에 올리는 POST 요청
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await initDb();
  const { id } = await context.params;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "INVALID_FILE" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `covers/${id}-${Date.now()}-${file.name}`;
    const bucketName = process.env.AWS_S3_BUCKET || "narra-covers";

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: buffer,
        ContentType: file.type,
      })
    );

    const publicUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || "ap-northeast-2"}.amazonaws.com/${filename}`;

    await db.query("UPDATE novels SET cover_url = $1 WHERE id = $2", [publicUrl, id]);

    return NextResponse.json({ cover_url: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ 
      error: "STORAGE_UPLOAD_FAILED", 
      detail: e.message,
      code: e.code 
    }, { status: 500 });
  }
}