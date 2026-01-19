import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";
import { getAudioRecord } from "@/lib/audio";

export async function GET(req: NextRequest, { params }: { params: Promise<{ novelId: string; episode: string; lang: string }> }) {
  await initDb();
  try {
    const { novelId, episode, lang } = await params;
    const record = await getAudioRecord(novelId, parseInt(episode), lang);
    if (!record) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    return NextResponse.json({ status: record.status, audio_url: record.status === "DONE" ? record.audio_url : null, duration_seconds: record.duration_seconds, error_message: record.error_message });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
