import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";
import { getAudioRecord, deleteAudioFile, updateAudioStatus } from "@/lib/audio";

const ADMIN_KEY = process.env.ADMIN_API_KEY;

function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!ADMIN_KEY || auth !== `Bearer ${ADMIN_KEY}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  await initDb();
  try {
    const body = await req.json();
    const { novel_id, episode_number, language } = body;
    if (!novel_id || !episode_number || !language) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const record = await getAudioRecord(novel_id, episode_number, language);
    if (!record) return NextResponse.json({ error: "Audio record not found" }, { status: 404 });
    if (record.status !== "FAILED" && record.status !== "DONE") {
      return NextResponse.json({ error: `Cannot retry audio in ${record.status} status` }, { status: 400 });
    }
    if (record.audio_url) await deleteAudioFile(novel_id, episode_number, language);
    await updateAudioStatus(novel_id, episode_number, language, "PENDING" as any, { audioUrl: "", errorMessage: "" });
    return NextResponse.json({ status: "retry_triggered", novel_id, episode_number, language, message: "Audio generation queued for retry" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
