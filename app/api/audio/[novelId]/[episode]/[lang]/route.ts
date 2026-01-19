export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb } from "../../../../../db";
import { getAudioRecord } from "../../../../../lib/audio";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ novelId: string; episode: string; lang: string }>;
  }
) {
  await initDb();

  const { novelId, episode, lang } = await params;
  const episodeNumber = Number(episode);

  if (Number.isNaN(episodeNumber)) {
    return NextResponse.json(
      { error: "INVALID_EPISODE_NUMBER" },
      { status: 400 }
    );
  }

  const record = await getAudioRecord(novelId, episodeNumber, lang);
  if (!record) {
    return NextResponse.json(
      { status: "NOT_FOUND", audio_url: null },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: "DONE",
    audio_url: record.file_path,
    voice: record.voice,
    created_at: record.created_at,
  });
}
