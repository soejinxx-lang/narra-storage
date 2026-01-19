import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";
import { listEpisodeAudio } from "@/lib/audio";

export async function GET(req: NextRequest, { params }: { params: Promise<{ novelId: string; episode: string }> }) {
  await initDb();
  try {
    const { novelId, episode } = await params;
    const records = await listEpisodeAudio(novelId, parseInt(episode));
    return NextResponse.json({ novel_id: novelId, episode_number: parseInt(episode), audio_files: records.map((r) => ({ language: r.language, status: r.status, audio_url: r.audio_url, duration_seconds: r.duration_seconds, file_size_bytes: r.file_size_bytes, error_message: r.error_message })) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
