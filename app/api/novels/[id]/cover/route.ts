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

// 1. 소설 상세 데이터 복구 (이게 있어야 화면에 소설이 뜹니다)
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

// 2. 표지 업로드 기능 (S3 연결 및 에러 상세 출력)
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
      detail: e.message || "S3 업로드 실패", // 이제 여기에 AccessDenied 등이 찍힙니다.
      code: e.code 
    }, { status: 500 });
  }
}