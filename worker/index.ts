/**
 * Translation Worker
 * 
 * PENDING 상태의 번역 작업을 순차적으로 처리하는 상주 프로세스
 * - DB에서 PENDING 작업 폴링
 * - Pipeline API 호출
 * - 상태 업데이트 (RUNNING → DONE/FAILED)
 */

import db, { initDb } from '../app/db';
import { splitIntoChunks } from './chunker';
import { translateWithPython, restructureParagraphsWithPython } from './translate';

// Pipeline merged into Worker - no longer using HTTP

interface TranslationJob {
  id: string;
  episode_id: string;
  language: string;
  novel_id: string;
  content: string;
  source_language: string;
}

/**
 * Fetch and claim the next pending job atomically
 * Also reclaims jobs stuck in RUNNING for more than 15 minutes (dead worker recovery)
 */
async function fetchAndClaimNextJob(): Promise<TranslationJob | null> {
  const result = await db.query(`
    UPDATE episode_translations
    SET 
      status = 'RUNNING',
      updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM episode_translations
      WHERE status = 'PENDING'
         OR (status = 'RUNNING' AND updated_at < NOW() - INTERVAL '15 minutes')
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING 
      id,
      episode_id,
      language,
      (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id) as novel_id,
      (SELECT content FROM episodes WHERE id = episode_translations.episode_id) as content,
      (SELECT source_language FROM novels WHERE id = (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id)) as source_language
  `);

  return result.rows[0] || null;
}

/**
 * Translate a single chunk with retry logic
 */
async function translateChunk(
  chunkText: string,
  language: string,
  novelId: string,
  chunkIndex: number,
  sourceLanguage: string
): Promise<string> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Call Python translation pipeline directly (no HTTP)
      const translatedText = await translateWithPython({
        novelTitle: novelId,
        text: chunkText,
        sourceLanguage: sourceLanguage,
        targetLanguage: language
      });

      return translatedText;

    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s, 3s
        console.log(`[Worker] ⚠️  Chunk ${chunkIndex} translation error, retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Translation failed after retries');
}

/**
 * Process a translation job with chunking
 */
async function processJob(job: TranslationJob): Promise<void> {
  const { id, episode_id, language, novel_id, content, source_language } = job;

  try {
    console.log(`[Worker] 📝 Processing ${language} for ${novel_id}/${episode_id}...`);

    // Skip if target language is same as source language
    if (language === source_language) {
      console.log(`[Worker] ⏭️  Skipping ${language} (source language)`);
      await db.query(
        `UPDATE episode_translations 
         SET status = 'DONE', 
             translated_text = $1,
             updated_at = NOW() 
         WHERE id = $2`,
        [content, id]
      );
      console.log(`[Worker] ✅ ${language} marked as DONE (source language)`);
      return;
    }

    // 0. Mark as PROCESSING
    console.log(`[Worker] 🔄 Updating status to PROCESSING for job ${id}...`);
    await db.query(
      `UPDATE episode_translations 
       SET status = 'PROCESSING', 
           updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );
    console.log(`[Worker] ✅ Status updated to PROCESSING`);

    // 1. Split text into chunks
    const chunks = splitIntoChunks(content, 2500);
    console.log(`[Worker] 📦 Split into ${chunks.length} chunks`);

    // 2. Translate each chunk sequentially (preserves context)
    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      console.log(`[Worker] 🔄 Translating chunk ${chunk.index + 1}/${chunks.length} (${chunk.charCount} chars)...`);
      const result = await translateChunk(chunk.text, language, novel_id, chunk.index, source_language);
      translatedChunks.push(result);
    }

    // 3. Merge results (preserves original structure)
    const mergedText = translatedChunks.join('');

    // 4. Restructure paragraphs (language-specific rhythm adjustment)
    console.log(`[Worker] 📝 Restructuring paragraphs for ${language}...`);
    const finalText = await restructureParagraphsWithPython(mergedText, language);
    console.log(`[Worker] ✅ Paragraph restructuring complete`);

    // 5. Save to DB (DONE status)
    await db.query(
      `UPDATE episode_translations 
       SET translated_text = $1, 
           status = 'DONE', 
           updated_at = NOW() 
       WHERE id = $2`,
      [finalText, id]
    );

    console.log(`[Worker] ✅ ${language} completed for ${novel_id}/${episode_id}`);

  } catch (error: any) {
    // 6. Mark as FAILED
    await db.query(
      `UPDATE episode_translations 
       SET status = 'FAILED', 
           error_message = $1, 
           updated_at = NOW() 
       WHERE id = $2`,
      [error.message || 'Unknown error', id]
    );

    console.error(`[Worker] ❌ ${language} failed for ${novel_id}/${episode_id}:`, error.message);
  }
}

/**
 * Worker 메인 루프
 */
async function main() {
  // 환경 변수 확인
  if (!process.env.OPENAI_API_KEY) {
    console.error('[Worker] ❌ Missing environment variable: OPENAI_API_KEY');
    process.exit(1);
  }

  await initDb();
  console.log('[Worker] 🚀 Translation Worker Started');
  console.log('[Worker] 🐍 Using Python translation_core (Pipeline merged)');
  console.log('[Worker] ⏰ Scheduler: checking every 60s for scheduled episodes');
  console.log('[Worker] 👀 Watching for PENDING jobs...\n');

  let lastScheduleCheck = 0;

  while (true) {
    try {
      // ── 1. 예약 스케줄러 (60초마다) ──
      if (Date.now() - lastScheduleCheck > 60_000) {
        try {
          const published = await db.query(`
            UPDATE episodes SET status = 'published'
            WHERE status = 'scheduled' AND scheduled_at <= NOW()
            RETURNING novel_id, ep
          `);
          if (published.rowCount && published.rowCount > 0) {
            for (const row of published.rows) {
              console.log(`[Scheduler] 📢 Published: ${row.novel_id} ep${row.ep}`);
            }
          }
        } catch (schedErr) {
          console.error('[Scheduler] ⚠️ Error:', schedErr);
        }
        lastScheduleCheck = Date.now();
      }

      // ── 2. 번역 작업 폴링 (기존) ──
      const job = await fetchAndClaimNextJob();

      if (!job) {
        // PENDING 작업 없음 - 1초 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // 작업 처리
      await processJob(job);

    } catch (error) {
      console.error('[Worker] ⚠️ Unexpected error:', error);
      // 에러 발생 시 5초 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Worker 시작
main().catch(error => {
  console.error('[Worker] 💥 Fatal error:', error);
  process.exit(1);
});
