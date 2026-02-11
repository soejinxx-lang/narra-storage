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

// ── 동시 처리 설정 ──
const PARALLEL_ENABLED = process.env.WORKER_PARALLEL_ENABLED === 'true';
const MAX_CONCURRENCY = Math.max(1, Number(process.env.WORKER_MAX_CONCURRENCY) || 3);

interface TranslationJob {
  id: string;
  episode_id: string;
  language: string;
  novel_id: string;
  content: string;
  source_language: string;
}

/**
 * Fetch and claim the next pending job atomically (단일 모드)
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
 * Fetch and claim multiple pending jobs for the same episode (병렬 모드)
 * Uses CTE for atomic episode selection + batch claim
 * Includes dead worker recovery (15min timeout reclaim)
 * // TODO: 멀티 Worker 확장 시 episode-level advisory lock 검토
 */
async function fetchAndClaimNextJobs(maxConcurrency: number): Promise<TranslationJob[]> {
  const result = await db.query(`
    WITH target AS (
      SELECT episode_id FROM episode_translations
      WHERE status = 'PENDING'
         OR (status = 'RUNNING' AND updated_at < NOW() - INTERVAL '15 minutes')
      ORDER BY created_at ASC
      LIMIT 1
    )
    UPDATE episode_translations
    SET status = 'RUNNING', updated_at = NOW()
    WHERE id IN (
      SELECT id FROM episode_translations
      WHERE episode_id = (SELECT episode_id FROM target)
        AND (status = 'PENDING' OR (status = 'RUNNING' AND updated_at < NOW() - INTERVAL '15 minutes'))
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING 
      id,
      episode_id,
      language,
      (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id) as novel_id,
      (SELECT content FROM episodes WHERE id = episode_translations.episode_id) as content,
      (SELECT source_language FROM novels WHERE id = (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id)) as source_language
  `, [maxConcurrency]);

  return result.rows;
}

/**
 * Process a job with stagger delay to prevent synchronized API bursts
 */
async function processJobWithStagger(job: TranslationJob, index: number): Promise<void> {
  if (index > 0) {
    const delay = 50 + Math.random() * 100;
    await new Promise(r => setTimeout(r, delay));
  }
  return processJob(job);
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
 * ── 연구 기반 조회수 증가 로직 ──
 * 
 * 참고 데이터:
 * - Royal Road/Wattpad: 1→2화 40~50% 이탈, 이후 회차당 ~5% 감소
 * - YouTube 연구: 업로드 후 첫 며칠 피크, 이후 급감 → 선형 안정화
 * - 글로벌 트래픽: 시간대별 sin 파동 (0.7~1.0)
 * - Wattpad: 정기 업데이트 시 77% 독자 유지
 */

// 에피소드별 남은 독자 비율 (이탈률 곡선)
// 1→2화에서 큰 이탈, 이후 완만
function chapterRetention(ep: number): number {
  if (ep <= 1) return 1.0;
  if (ep === 2) return 0.58;   // 42% 이탈 (Royal Road 평균)
  // 2화 이후: 회차당 약 5% 감소 (95% 유지)
  return Math.max(0.05, 0.58 * Math.pow(0.95, ep - 2));
}

// 시간대 가중치 — sin 곡선으로 약한 글로벌 파도
// 다국적 플랫폼이므로 극단적 차이 없이 0.7~1.0 범위
function timeWeight(hour: number): number {
  return 0.85 + 0.15 * Math.sin(hour * Math.PI / 12);
}

// 신선도 — 업로드 후 경과 시간에 따른 감소
// YouTube 연구: 첫 며칠 피크 → 급감 → 안정화
function freshness(hoursAfterCreation: number): number {
  if (hoursAfterCreation < 6) return 2.0;
  if (hoursAfterCreation < 24) return 1.5;
  if (hoursAfterCreation < 72) return 1.0;     // 3일
  if (hoursAfterCreation < 168) return 0.5;    // 7일
  if (hoursAfterCreation < 336) return 0.3;    // 14일
  return 0.15;                                  // Long tail
}

// 업데이트 부스트 — 소설에 새 에피소드가 올라오면 전체 부스트
// Wattpad: 정기 업데이트 시 77% 독자 유지 → 신규 유입 반영
function updateBoost(hoursSinceLastUpdate: number): number {
  if (hoursSinceLastUpdate < 6) return 1.8;    // 막 업데이트됨
  if (hoursSinceLastUpdate < 24) return 1.4;
  if (hoursSinceLastUpdate < 48) return 1.2;
  return 1.0;                                   // 효과 소멸
}

/**
 * 모든 published 에피소드의 조회수를 자연스럽게 증가
 * 1분마다 Worker에서 호출
 * 
 * 이중 시스템:
 *   1) 이 함수 = 봇 조회수 (백그라운드 자연 증가)
 *   2) /api/episodes/[id]/view = 실제 클릭 시 +1
 */
async function updateViewCounts(): Promise<void> {
  // 모든 published 에피소드 조회
  // COALESCE(scheduled_at, created_at) = 실제 공개 시점
  // → 예약 에피소드: scheduled_at (공개 예정 시각)
  // → 즉시 공개: created_at (업로드 시각)
  const result = await db.query(`
    SELECT 
      e.id, e.novel_id, e.ep, e.views,
      COALESCE(e.scheduled_at, e.created_at) as published_at,
      (SELECT MAX(COALESCE(e2.scheduled_at, e2.created_at)) FROM episodes e2 
       WHERE e2.novel_id = e.novel_id AND e2.status = 'published') as latest_ep_at
    FROM episodes e
    WHERE e.status = 'published'
    ORDER BY e.novel_id, e.ep
  `);

  if (result.rows.length === 0) return;

  const now = new Date();
  const currentHour = now.getUTCHours();
  let totalAdded = 0;

  for (const ep of result.rows) {

    // ── 소설별 고유 개성 (novel_id 해시 기반) ──
    const novelHash = hashCode(ep.novel_id);

    // base 편차: 멱법칙(Power Law) — 대부분 낮고, 소수만 높음
    // 해시를 0~1로 정규화 후 제곱 → 높은 값일수록 확률 급감
    const hashRatio = ((novelHash >> 0) & 0xFFFF) / 0xFFFF;  // 0~1 균등
    const skewed = Math.pow(hashRatio, 2.5);                  // 제곱으로 기울임
    const base = Math.round(5 + skewed * 55);                 // 5~60 범위

    // 시간 오프셋: 소설마다 sin 곡선의 위상이 다름 (±6시간)
    const timeOffset = ((novelHash >> 8) & 0xFF) % 12;

    // jitter 범위: 소설마다 변동 폭이 다름 (±20%~±50%)
    const jitterRange = 0.2 + (((novelHash >> 16) & 0xFF) / 255) * 0.3;

    // 간헐적 quiet/burst: 소설마다 다른 리듬
    // 현재 시간을 novel_id로 시프트해 일정 주기마다 조용해지거나 활발해짐
    const cycleHour = (currentHour + ((novelHash >> 24) & 0xF)) % 24;
    const burstFactor = cycleHour < 4 ? 0.3 : (cycleHour > 20 ? 1.5 : 1.0);

    // published_at 기준으로 경과 시간 계산 (예약 에피소드도 공개 시점 기준)
    const hoursAfterPublish = (now.getTime() - new Date(ep.published_at).getTime()) / (1000 * 60 * 60);
    const hoursSinceLastUpdate = ep.latest_ep_at
      ? (now.getTime() - new Date(ep.latest_ep_at).getTime()) / (1000 * 60 * 60)
      : 999;

    // 공식: base × 시간대 × 이탈률 × 신선도 × 업데이트부스트 × 버스트팩터
    const viewsPerHour = base
      * timeWeight(currentHour + timeOffset)
      * chapterRetention(ep.ep)
      * freshness(hoursAfterPublish)
      * updateBoost(hoursSinceLastUpdate)
      * burstFactor;

    // 1분 단위로 변환 (÷60) + 소설별 jitter
    const viewsPerMin = viewsPerHour / 60;
    const jitter = (1 - jitterRange) + Math.random() * (jitterRange * 2);
    let addViews = Math.round(viewsPerMin * jitter);

    // 최소 보장: 아무리 낮아도 시간당 1회는 올라가도록 (1/60 확률)
    if (addViews === 0 && Math.random() < 1 / 60) {
      addViews = 1;
    }

    if (addViews > 0) {
      await db.query(
        `UPDATE episodes SET views = views + $1 WHERE id = $2`,
        [addViews, ep.id]
      );
      totalAdded += addViews;
    }
  }

  if (totalAdded > 0) {
    console.log(`[Views] 📊 +${totalAdded} views across ${result.rows.length} episodes`);
  }
}

// novel_id 문자열 → 안정적인 정수 해시
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32bit integer
  }
  return Math.abs(hash);
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
  console.log(`[Worker] ⚡ Mode: ${PARALLEL_ENABLED ? `PARALLEL (max ${MAX_CONCURRENCY})` : 'SEQUENTIAL'}`);
  console.log('[Worker] ⏰ Scheduler: checking every 60s for scheduled episodes');
  console.log('[Worker] 👀 Watching for PENDING jobs...\n');

  let lastScheduleCheck = 0;
  let lastViewsUpdate = 0;

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

      // ── 2. 조회수 스케줄러 (1분마다) ── 연구 기반 자연스러운 조회수 증가
      if (Date.now() - lastViewsUpdate > 60_000) {
        try {
          await updateViewCounts();
        } catch (viewErr) {
          console.error('[Views] ⚠️ Error:', viewErr);
        }
        lastViewsUpdate = Date.now();
      }

      // ── 3. 번역 작업 폴링 ──
      if (PARALLEL_ENABLED) {
        // 병렬 모드: 같은 에피소드의 PENDING 작업을 최대 N개씩 동시 처리
        const jobs = await fetchAndClaimNextJobs(MAX_CONCURRENCY);

        if (jobs.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        console.log(`[Worker] 🚀 Parallel batch: ${jobs.length} jobs (${jobs.map(j => j.language).join(', ')})`);
        await Promise.allSettled(jobs.map((job, i) => processJobWithStagger(job, i)));
      } else {
        // 순차 모드: 1개씩 처리 (기본)
        const job = await fetchAndClaimNextJob();

        if (!job) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        await processJob(job);
      }

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
