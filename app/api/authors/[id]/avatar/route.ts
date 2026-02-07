export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getS3Client() {
    return new S3Client({
        region: process.env.AWS_REGION ?? "ap-northeast-2",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
        },
    });
}

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    await initDb();

    const { id } = await context.params;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
        return NextResponse.json({ error: "INVALID_FILE" }, { status: 400 });
    }

    if (!process.env.AWS_S3_BUCKET) {
        return NextResponse.json({ error: "S3_BUCKET_NOT_SET" }, { status: 500 });
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        return NextResponse.json({ error: "AWS_CREDENTIALS_NOT_SET" }, { status: 500 });
    }

    const buffer = Buffer.from(await (file as any).arrayBuffer());
    const filename = typeof (file as any).name === "string" ? (file as any).name : "avatar";
    const contentType =
        typeof (file as any).type === "string" && (file as any).type.length > 0
            ? (file as any).type
            : "image/jpeg";

    const key = `avatars/${id}-${Date.now()}-${filename}`;

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
        console.error("[AVATAR UPLOAD] FAILED", e);
        return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });
    }

    const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    const result = await db.query(
        "UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id",
        [publicUrl, id]
    );

    if (result.rowCount === 0) {
        return NextResponse.json({ error: "AUTHOR_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ avatar_url: publicUrl });
}
