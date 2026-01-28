/**
 * Translation Worker
 * 
 * PENDING 상태의 번역 작업을 순차적으로 처리하는 상주 프로세스
 * - DB에서 PENDING 작업 폴링
 * - Pipeline API 호출
 * - 상태 업데이트 (RUNNING → DONE/FAILED)
 */

import db, { initDb } from '../app/db';

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
 * DB에서 다음 PENDING 작업 가져오기
 */
async function fetchNextJob(): Promise<TranslationJob | null> {
  const result = await db.query(`
    SELECT
      et.id,
      et.episode_id,
      et.language,
      e.novel_id,
      e.content
    FROM episode_translations et
    JOIN episodes e ON e.id = et.episode_id
    WHERE et.status = 'PENDING'
    ORDER BY et.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);

  return result.rows[0] || null;
}

/**
 * 번역 작업 처리
 */
async function processJob(job: TranslationJob): Promise<void> {
  const { id, episode_id, language, novel_id, content } = job;

  try {
    // 1. RUNNING 상태로 변경
    await db.query(
      `UPDATE episode_translations 
       SET status = 'RUNNING', updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    console.log(`[Worker] 📝 Processing ${language} for ${novel_id}/${episode_id}...`);

    // 2. Pipeline API 호출
    const res = await fetch(`${PIPELINE_BASE_URL}/translate_episode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Pin': PIPELINE_ACCESS_PIN || ''
      },
      body: JSON.stringify({
        novel_title: novel_id,
        text: content,
        language
      })
    });

    if (!res.ok) {
      throw new Error(`Pipeline error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // 3. DONE 상태로 변경 + 번역 저장
    await db.query(
      `UPDATE episode_translations 
       SET translated_text = $1, 
           status = 'DONE', 
           updated_at = NOW() 
       WHERE id = $2`,
      [data.translated_text, id]
    );

    console.log(`[Worker] ✅ ${language} completed for ${novel_id}/${episode_id}`);

  } catch (error: any) {
    // 4. FAILED 상태로 변경
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
      const job = await fetchNextJob();

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
