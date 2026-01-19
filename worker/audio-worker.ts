import db, { initDb } from "../app/db";
import { generateAudio, getVoiceName, preprocessText, splitIntoChunks } from "../app/lib/tts";
import { createAudioRecord, saveAudioFile } from "../app/lib/audio";

async function runOnce() {
  await initDb();
  console.log("[AudioWorker] Initialized (one-shot)");

  const result = await db.query(
    `
    SELECT e.novel_id, e.ep, et.language, et.translated_text
    FROM episode_translations et
    JOIN episodes e ON e.id = et.episode_id
    WHERE et.status = 'DONE'
      AND et.translated_text IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM audio_files af
        WHERE af.novel_id = e.novel_id
          AND af.episode = e.ep
          AND af.lang = et.language
      )
    ORDER BY e.novel_id, e.ep
    `
  );

  for (const task of result.rows) {
    const { novel_id, ep, language, translated_text } = task as {
      novel_id: string;
      ep: number;
      language: string;
      translated_text: string;
    };

    const voiceName = getVoiceName(language);
    if (!voiceName) {
      console.warn(`[AudioWorker] Unsupported language: ${language}`);
      continue;
    }

    console.log(`[AudioWorker] Generating ${novel_id}/${ep}/${language}`);

    const processedText = preprocessText(translated_text);
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

    const filePath = await saveAudioFile(novel_id, ep, language, audioData);
    await createAudioRecord(novel_id, ep, language, voiceName, filePath);
    console.log(`[AudioWorker] ✓ Stored ${novel_id}/${ep}/${language}`);
  }
}

console.log("[AudioWorker] Starting...");
runOnce().catch((error) => {
  console.error("[AudioWorker] Fatal error:", error);
  process.exit(1);
});
