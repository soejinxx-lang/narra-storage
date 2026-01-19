import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";
import { createAudioRecord, deleteAudioFile, deleteAudioRecord, getAudioRecord, saveAudioFile } from "../../../lib/audio";
import { generateAudio, getVoiceName, preprocessText, splitIntoChunks } from "../../../lib/tts";

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
    const { novel_id, episode_number, episode, language } = body;
    const resolvedEpisode = Number(episode_number ?? episode);

    if (!novel_id || !resolvedEpisode || !language) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const record = await getAudioRecord(novel_id, resolvedEpisode, language);
    if (!record) {
      return NextResponse.json({ error: "Audio record not found" }, { status: 404 });
    }

    await deleteAudioFile(novel_id, resolvedEpisode, language);
    await deleteAudioRecord(novel_id, resolvedEpisode, language);

    const voiceName = getVoiceName(language);
    if (!voiceName) {
      return NextResponse.json({ error: `Unsupported language: ${language}` }, { status: 400 });
    }

    const textRes = await db.query(
      `
      SELECT et.translated_text
      FROM episode_translations et
      JOIN episodes e ON e.id = et.episode_id
      WHERE e.novel_id = $1
        AND e.ep = $2
        AND et.language = $3
        AND et.status = 'DONE'
      `,
      [novel_id, resolvedEpisode, language]
    );

    const text = textRes.rows[0]?.translated_text as string | undefined;
    if (!text) {
      return NextResponse.json({ error: "No translated text found" }, { status: 400 });
    }

    const processedText = preprocessText(text);
    const chunks = splitIntoChunks(processedText, 4500);
    let audioData: Buffer;
    if (chunks.length === 1) {
      audioData = await generateAudio(chunks[0], language);
    } else {
      const audioChunks = await Promise.all(
        chunks.map((chunk) => generateAudio(chunk, language))
      );
      audioData = Buffer.concat(audioChunks);
    }

    const filePath = await saveAudioFile(novel_id, resolvedEpisode, language, audioData);
    await createAudioRecord(novel_id, resolvedEpisode, language, voiceName, filePath);

    return NextResponse.json({
      status: "regenerated",
      novel_id,
      episode: resolvedEpisode,
      language,
      message: "Audio regenerated and stored",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
