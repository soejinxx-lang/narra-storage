import db, { initDb } from "../app/db";
import { generateAudio, preprocessText, splitIntoChunks } from "../app/lib/tts";
import {
  updateAudioStatus,
  saveAudioFile,
  getAudioFileSize,
  calculateDuration,
} from "../app/lib/audio";

async function getNextPendingTask() {
  const result = await db.query(
    `SELECT novel_id, episode_number, language, voice_name 
     FROM audio_files
     WHERE status = 'PENDING' 
     ORDER BY created_at ASC 
     LIMIT 1`
  );
  return result.rows[0] || null;
}

async function getEpisodeText(
  novelId: string,
  episodeNumber: number,
  language: string
): Promise<string | null> {
  const result = await db.query(
    `SELECT et.translated_text
     FROM episode_translations et
     JOIN episodes e ON e.id = et.episode_id
     WHERE e.novel_id = $1 
       AND e.ep = $2 
       AND et.language = $3 
       AND et.status = 'DONE'`,
    [novelId, episodeNumber, language]
  );
  return result.rows[0]?.translated_text || null;
}

async function processTask(task: any) {
  const { novel_id, episode_number, language } = task;
  console.log(`[AudioWorker] Processing ${novel_id}/${episode_number}/${language}`);

  try {
    await updateAudioStatus(novel_id, episode_number, language, "PROCESSING");

    const text = await getEpisodeText(novel_id, episode_number, language);
    if (!text) {
      throw new Error(`No text content found for ${language}`);
    }

    const processedText = preprocessText(text);
    const chunks = splitIntoChunks(processedText, 4500);
    console.log(`[AudioWorker] Processing ${chunks.length} chunks`);

    let audioData: Buffer;
    if (chunks.length === 1) {
      audioData = await generateAudio(chunks[0], language);
    } else {
      const audioChunks = await Promise.all(
        chunks.map((chunk) => generateAudio(chunk, language))
      );
      audioData = Buffer.concat(audioChunks);
    }

    const duration = calculateDuration(audioData);
    const audioUrl = await saveAudioFile(novel_id, episode_number, language, audioData);
    const fileSize = await getAudioFileSize(novel_id, episode_number, language);

    await updateAudioStatus(novel_id, episode_number, language, "DONE", {
      audioUrl,
      durationSeconds: duration,
      fileSizeBytes: fileSize || undefined,
    });

    console.log(`[AudioWorker] ✓ Completed ${novel_id}/${episode_number}/${language}`);
  } catch (error) {
    const errorMsg = String(error);
    console.error(`[AudioWorker] ✗ Failed ${novel_id}/${episode_number}/${language}:`, errorMsg);
    await updateAudioStatus(novel_id, episode_number, language, "FAILED", {
      errorMessage: errorMsg,
    });
  }
}

async function workerLoop() {
  await initDb();
  console.log("[AudioWorker] Initialized");

  while (true) {
    try {
      const task = await getNextPendingTask();
      if (task) {
        await processTask(task);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error("[AudioWorker] Error in worker loop:", error);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

console.log("[AudioWorker] Starting...");
workerLoop().catch((error) => {
  console.error("[AudioWorker] Fatal error:", error);
  process.exit(1);
});
