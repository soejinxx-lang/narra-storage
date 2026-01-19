import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";
import { createAudioRecord } from "@/lib/audio";
import { getVoiceName } from "@/lib/tts";

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
    const { novel_id, episode_number, language, languages } = body;
    if (languages && Array.isArray(languages)) {
      const results = [];
      for (const lang of languages) {
        try {
          const voiceName = getVoiceName(lang);
          if (!voiceName) { results.push({ language: lang, success: false, error: "Unsupported language" }); continue; }
          await createAudioRecord(novel_id, episode_number, lang, voiceName);
          results.push({ language: lang, success: true });
        } catch (error) {
          results.push({ language: lang, success: false, error: String(error) });
        }
      }
      return NextResponse.json({ status: "triggered", novel_id, episode_number, total: languages.length, success: results.filter((r) => r.success).length, results });
    }
    if (!novel_id || !episode_number || !language) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const voiceName = getVoiceName(language);
    if (!voiceName) return NextResponse.json({ error: `Unsupported language: ${language}` }, { status: 400 });
    await createAudioRecord(novel_id, episode_number, language, voiceName);
    return NextResponse.json({ status: "triggered", novel_id, episode_number, language, message: "Audio generation queued" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
