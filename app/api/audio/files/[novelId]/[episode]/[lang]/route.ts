export const runtime = "nodejs";

import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/app/audio";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ novelId: string; episode: string; lang: string }>;
  }
) {
  const { novelId, episode, lang } = await params;
  const episodeNumber = Number(episode);

  if (Number.isNaN(episodeNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const filePath = path.join(
    AUDIO_ROOT,
    novelId,
    String(episodeNumber),
    `${lang}.mp3`
  );

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "AUDIO_FILE_NOT_FOUND" },
      { status: 404 }
    );
  }
}
