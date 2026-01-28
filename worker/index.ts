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

const PIPELINE_BASE_URL = process.env.PIPELINE_BASE_URL;
const PIPELINE_ACCESS_PIN = process.env.PIPELINE_ACCESS_PIN;

interface TranslationJob {
  id: string;
  episode_id: string;
  language: string;
  novel_id: string;
  content: string;
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
      (SELECT content FROM episodes WHERE id = episode_translations.episode_id) as content
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
  chunkIndex: number
): Promise<string> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${PIPELINE_BASE_URL}/translate_episode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Pin': PIPELINE_ACCESS_PIN || ''
        },
        body: JSON.stringify({
          novel_title: novelId,
          text: chunkText,
          language
        })
      });

      // Success
      if (res.ok) {
        const data = await res.json();
        return data.translated_text;
      }

      // 499 Timeout / 5xx Server Error → Retry
      if (res.status === 499 || res.status >= 500) {
        lastError = new Error(`Server error: ${res.status} ${res.statusText}`);
        if (attempt < MAX_RETRIES - 1) {
          const backoffMs = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s, 3s
          console.log(`[Worker] ⚠️  Chunk ${chunkIndex} failed (${res.status}), retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      }

      // 4xx Client Error → Immediate failure
      throw new Error(`Client error: ${res.status} ${res.statusText}`);

    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = 1000 * (attempt + 1);
        console.log(`[Worker] ⚠️  Chunk ${chunkIndex} error, retrying in ${backoffMs}ms...`);
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
  const { id, episode_id, language, novel_id, content } = job;

  try {
    console.log(`[Worker] 📝 Processing ${language} for ${novel_id}/${episode_id}...`);

    // 1. Split text into chunks
    const chunks = splitIntoChunks(content, 2500);
    console.log(`[Worker] 📦 Split into ${chunks.length} chunks`);

    // 2. Translate each chunk sequentially (preserves context)
    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      console.log(`[Worker] 🔄 Translating chunk ${chunk.index + 1}/${chunks.length} (${chunk.charCount} chars)...`);
      const result = await translateChunk(chunk.text, language, novel_id, chunk.index);
      translatedChunks.push(result);
    }

    // 3. Merge results (preserves original structure)
    const finalText = translatedChunks.join('');

    // 4. Save to DB (DONE status)
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
    // 5. Mark as FAILED
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
  if (!PIPELINE_BASE_URL || !PIPELINE_ACCESS_PIN) {
    console.error('[Worker] ❌ Missing environment variables:');
    if (!PIPELINE_BASE_URL) console.error('  - PIPELINE_BASE_URL');
    if (!PIPELINE_ACCESS_PIN) console.error('  - PIPELINE_ACCESS_PIN');
    process.exit(1);
  }

  await initDb();
  console.log('[Worker] 🚀 Translation Worker Started');
  console.log(`[Worker] 📍 Pipeline: ${PIPELINE_BASE_URL}`);
  console.log('[Worker] 👀 Watching for PENDING jobs...\n');

  while (true) {
    try {
      // Atomic하게 작업 가져오기 + 상태 변경
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
