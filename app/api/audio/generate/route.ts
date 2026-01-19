import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";
import { createAudioRecord, saveAudioFile } from "../../../lib/audio";
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

  const generateForLanguage = async (
    novelId: string,
    episodeNumber: number,
    lang: string
  ) => {
    const voiceName = getVoiceName(lang);
    if (!voiceName) {
      throw new Error(`Unsupported language: ${lang}`);
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
      [novelId, episodeNumber, lang]
    );

    const text = textRes.rows[0]?.translated_text as string | undefined;
    if (!text) {
      throw new Error(`No translated text found for ${lang}`);
    }

    const processedText = preprocessText(text);
    const chunks = splitIntoChunks(processedText, 4500);
    let audioData: Buffer;
    if (chunks.length === 1) {
      audioData = await generateAudio(chunks[0], lang);
    } else {
      const audioChunks = await Promise.all(
        chunks.map((chunk) => generateAudio(chunk, lang))
      );
      audioData = Buffer.concat(audioChunks);
    }

    const filePath = await saveAudioFile(novelId, episodeNumber, lang, audioData);
    await createAudioRecord(novelId, episodeNumber, lang, voiceName, filePath);
  };

  try {
    const body = await req.json();
    const { novel_id, episode_number, episode, language, languages } = body;
    const resolvedEpisode = Number(episode_number ?? episode);

    if (languages && Array.isArray(languages)) {
      const results = [];
      for (const lang of languages) {
        try {
          await generateForLanguage(novel_id, resolvedEpisode, lang);
          results.push({ language: lang, success: true });
        } catch (error) {
          results.push({ language: lang, success: false, error: String(error) });
        }
      }
      return NextResponse.json({
        status: "triggered",
        novel_id,
        episode: resolvedEpisode,
        total: languages.length,
        success: results.filter((r) => r.success).length,
        results,
      });
    }

    if (!novel_id || !resolvedEpisode || !language) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await generateForLanguage(novel_id, resolvedEpisode, language);

    return NextResponse.json({
      status: "generated",
      novel_id,
      episode: resolvedEpisode,
      language,
      message: "Audio generated and stored",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
