export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// AWS 설정 - Railway 환경변수를 참조합니다.
const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
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

  try {
    // Admin이 보낸 FormData(파일)를 읽습니다.
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "INVALID_FILE" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `covers/${id}-${Date.now()}-${file.name}`;
    const bucketName = process.env.AWS_S3_BUCKET || "narra-covers";

    // 1. AWS S3에 실제 업로드 시도
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: buffer,
        ContentType: file.type,
      })
    );

    // 2. 업로드된 S3 URL 생성
    const publicUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || "ap-northeast-2"}.amazonaws.com/${filename}`;

    // 3. DB에 URL 업데이트
    await db.query(
      "UPDATE novels SET cover_url = $1 WHERE id = $2",
      [publicUrl, id]
    );

    return NextResponse.json({ cover_url: publicUrl });
  } catch (e: any) {
    // [중요] 상세 에러를 반환하여 Admin 화면의 detail을 채웁니다.
    console.error("S3_UPLOAD_ERROR:", e);
    return NextResponse.json(
      { 
        error: "STORAGE_UPLOAD_FAILED", 
        detail: e.message || "Unknown S3 Error",
        code: e.code || e.name 
      },
      { status: 500 }
    );
  }
}