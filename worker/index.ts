/**
 * Translation Worker
 * 
 * PENDING 상태의 번역 작업을 순차적으로 처리하는 상주 프로세스
 * - DB에서 PENDING 작업 폴링
 * - Pipeline API 호출
 * - 상태 업데이트 (RUNNING → DONE/FAILED)
 */

import db, { initDb } from '../app/db.js';
import { splitIntoChunks } from './chunker.js';
import { translateWithPython, restructureParagraphsWithPython } from './translate.js';
import { runCommentBotIntl } from '../app/api/dev/run-comment-bot-intl/engine.js';
import { runKoreanCommentBot } from '../app/api/dev/run-comment-bot/ko-engine.js';
import type { LanguagePack } from '../app/api/dev/run-comment-bot-intl/types.js';
import { refundTranslationQuota } from '../lib/requireAuth.js';
import { MODEL_PARAMS, calcBotTarget, generateNovelQ as _generateNovelQ } from '../lib/comment-bot-model.js';

// 언어팩 동적 로더 (NodeNext moduleResolution 호환)
async function loadLangPack(lang: string): Promise<LanguagePack> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  switch (lang) {
    case 'ko': mod = await import('../app/api/dev/run-comment-bot-intl/lang/ko.js'); break;
    case 'ja': mod = await import('../app/api/dev/run-comment-bot-intl/lang/ja.js'); break;
    case 'zh': mod = await import('../app/api/dev/run-comment-bot-intl/lang/zh.js'); break;
    case 'es': mod = await import('../app/api/dev/run-comment-bot-intl/lang/es.js'); break;
    default: mod = await import('../app/api/dev/run-comment-bot-intl/lang/en.js'); break;
  }
  return mod.default as LanguagePack;
}

// Pipeline merged into Worker - no longer using HTTP

// 같은 에피소드 내 동시 번역 수 (burst 방지를 위해 3개 제한)
const MAX_CONCURRENCY = 3;

interface TranslationJob {
  id: string;
  episode_id: string;
  language: string;
  novel_id: string;
  content: string;
  source_language: string;
  author_id: string;
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
      SELECT et.id
      FROM episode_translations et
      JOIN episodes ep ON et.episode_id = ep.id
      JOIN novels n ON ep.novel_id = n.id
      WHERE (et.status = 'PENDING'
         OR (et.status = 'RUNNING' AND et.updated_at < NOW() - INTERVAL '15 minutes'))
        AND n.deleted_at IS NULL
      ORDER BY et.created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING 
      id,
      episode_id,
      language,
      (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id) as novel_id,
      (SELECT content FROM episodes WHERE id = episode_translations.episode_id) as content,
      (SELECT source_language FROM novels WHERE id = (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id)) as source_language,
      (SELECT author_id FROM novels WHERE id = (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id)) as author_id
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
      SELECT et.episode_id FROM episode_translations et
      JOIN episodes ep ON et.episode_id = ep.id
      JOIN novels n ON ep.novel_id = n.id
      WHERE (et.status = 'PENDING'
         OR (et.status = 'RUNNING' AND et.updated_at < NOW() - INTERVAL '15 minutes'))
        AND n.deleted_at IS NULL
      ORDER BY et.created_at ASC
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
      (SELECT source_language FROM novels WHERE id = (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id)) as source_language,
      (SELECT author_id FROM novels WHERE id = (SELECT novel_id FROM episodes WHERE id = episode_translations.episode_id)) as author_id
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
 * ── 조회수 시뮬레이션 v3.1 — 행동 기반 모델 ──
 * 
 * GPT 2차 검증 반영. 가상 독자가 실제 행동 패턴으로 조회수 생성.
 * 
 * 핵심 구조:
 *   - 가상 독자 풀 (메모리, 100명 초기)
 *   - 세션 기반 정주행 (70→56→45% 연쇄)
 *   - 신규/재방문/구독 독자 분리
 *   - 소설 단위 saturation (ceiling 10,000)
 *   - deeper long tail (90일+ → 0.01)
 * 
 * 참고 데이터:
 *   - Royal Road/Wattpad: 1→2화 42% 이탈, 이후 회차당 ~5% 감소
 *   - YouTube: 업로드 후 첫 며칠 피크, 이후 급감
 *   - Wattpad: 정기 업데이트 시 77% 독자 유지
 * 
 * 이중 시스템:
 *   1) 이 함수 = 시뮬레이션 조회수 (행동 기반)
 *   2) /api/episodes/[id]/view = 실제 클릭 시 +1
 * 
 * 향후 Cron 분리 가능 (현재는 Worker setInterval)
 */

// ── 설정값 (쉽게 조정 가능) ──
const VIEW_CONFIG = {
  INITIAL_POOL_SIZE: 100,    // 초기 가상 독자 수
  MAX_POOL_SIZE: 300,        // 풀 상한
  NEW_VISITOR_RATE: 0.3,     // 분당 신규 유입 기본값 (× 소설 수)
  VIEW_CEILING: 10_000,      // 소설 단위 포화 기준
  SUBSCRIBED_RETURN: 0.6,    // 구독 독자 신화 재방문 확률 (60%)
};

// ── 가상 독자 타입 ──
interface VirtualReader {
  id: string;
  novelId: string;
  lastEp: number;
  lastVisitMin: number;
  returnRate: number;        // 분당 재방문 확률 (0.002~0.006)
  bingeDepth: number;        // 최대 연속 읽기 (2~4)
  status: 'active' | 'subscribed' | 'dormant';
}

interface NovelInfo {
  id: string;
  maxEp: number;
  totalViews: number;
  avgViews: number;
  hoursSinceLastEp: number;
  bingeRate: number;
  commentDensity: number;  // 댓글수/조회수 (피드백 루프용)
  episodeMap: Map<number, string>;  // ep번호 → episode_id
}

// ── Worker 수명 동안 유지되는 상태 ──
let readerPool: Map<string, VirtualReader> | null = null;
const carryBuffer: Map<string, number> = new Map();

// ── 신선도 — stretched-exponential (콘텐츠 주의력 연구 기반) ──
// 참고: NIH stretched-exponential decay, YouTube novelty curve
// τ=48h (2일 반감기), β=0.6 (sub-exponential long tail)
function freshness(hours: number): number {
  return Math.max(0.003, 1.8 * Math.exp(-Math.pow(hours / 48, 0.6)));
}

// ── 업데이트 부스트 — 새 에피소드 올라오면 유입 증가 ──
function updateBoost(hours: number): number {
  if (hours < 6) return 1.8;
  if (hours < 24) return 1.4;
  if (hours < 48) return 1.2;
  return 1.0;
}

// ── 인기도 팩터 — 사회적 증폭 (log 기반, 폭주 방지) ──
function popularityFactor(views: number): number {
  return 1 + Math.log10((views || 0) + 1) * 0.15;
}

// ── 소설 단위 포화 — ceiling에 가까울수록 성장 둔화 ──
function saturationFactor(avgViews: number): number {
  return 1 / (1 + avgViews / VIEW_CONFIG.VIEW_CEILING);
}

// ── 작품별 정주행 확률 — 인기작일수록 높음 ──
function calcBingeRate(totalViews: number): number {
  const popBonus = Math.min(0.1, Math.log10((totalViews || 0) + 1) * 0.03);
  return Math.min(0.8, 0.6 + popBonus);  // 0.6 ~ 0.8
}

// ── 소설 선택 가중치 (댓글 피드백 루프 포함) ──
function novelWeight(novel: NovelInfo): number {
  const fresh = freshness(novel.hoursSinceLastEp);
  const popular = popularityFactor(novel.totalViews);
  const sat = saturationFactor(novel.avgViews);
  const boost = updateBoost(novel.hoursSinceLastEp);
  const cmtBoost = commentDensityBoost(novel.commentDensity * novel.totalViews, novel.totalViews);
  return fresh * popular * sat * boost * cmtBoost;
}

// ── 가중치 기반 소설 선택 ──
function weightedSelectNovel(novels: NovelInfo[]): NovelInfo {
  const weights = novels.map(n => novelWeight(n));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return novels[Math.floor(Math.random() * novels.length)];

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < novels.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return novels[i];
  }
  return novels[novels.length - 1];
}

// ── 조회수 감쇠 (출력 스케일링) ──
// 시뮬레이션 분포는 유지하되 절대값만 축소
// carry가 fractional로 누적 → Math.floor 기존 로직이 자연스럽게 처리
const VIEW_DAMPENING = 0.02;  // ~1/50 스케일 → 주당 ~750 views (기존 대비 절반)


// ── 정주행 세션 — 핵심 행동 모델 ──
function simulateBingeSession(
  reader: VirtualReader,
  novel: NovelInfo,
  buffer: Map<string, number>
): void {
  let currentEp = reader.lastEp;
  let continueProb = novel.bingeRate;  // 작품별 (0.6~0.8)

  for (let i = 0; i < reader.bingeDepth; i++) {
    if (currentEp > novel.maxEp) break;

    const epId = novel.episodeMap.get(currentEp);
    if (epId) {
      // 감쇠 + ±20% 지터 → 자연스러운 노이즈
      const weight = VIEW_DAMPENING * (0.8 + Math.random() * 0.4);
      buffer.set(epId, (buffer.get(epId) || 0) + weight);
    }

    currentEp++;
    if (Math.random() > continueProb) break;
    // Royal Road 데이터: 1→2화 큰 이탈(작품 선택 실패), 이후 회차당 ~5% 이탈(콘텐츠 피로)
    continueProb = i === 0 ? 0.55 : continueProb * 0.95;
  }

  reader.lastEp = Math.max(reader.lastEp, currentEp - 1);

  if (reader.lastEp >= novel.maxEp) {
    reader.status = 'subscribed';
  }
}

// ── 독자 풀 초기화 ──
function initReaderPool(novels: NovelInfo[]): Map<string, VirtualReader> {
  const pool = new Map<string, VirtualReader>();
  for (let i = 0; i < VIEW_CONFIG.INITIAL_POOL_SIZE; i++) {
    const novel = weightedSelectNovel(novels);
    // 기존 독자: 이미 어딘가까지 읽은 상태
    const lastEp = 1 + Math.floor(Math.random() * novel.maxEp);
    const isCompleted = lastEp >= novel.maxEp;

    pool.set(`r_init_${i}`, {
      id: `r_init_${i}`,
      novelId: novel.id,
      lastEp: lastEp,
      lastVisitMin: Date.now(),
      returnRate: 0.002 + Math.random() * 0.004,  // 0.002~0.006/분
      bingeDepth: 2 + Math.floor(Math.random() * 3),  // 2~4
      status: isCompleted ? 'subscribed' : 'active',
    });
  }
  console.log(`[Views] 👥 Reader pool initialized: ${pool.size} readers across ${novels.length} novels`);
  return pool;
}

// ── 신규 유입 (Poisson 근사) ──
function generateNewVisitors(
  hour: number,
  novels: NovelInfo[],
  pool: Map<string, VirtualReader>,
  buffer: Map<string, number>
): void {
  // 시간대 변동 — 비대칭 이중 harmonic (KST 21시=UTC 12시 피크)
  // 저녁 상승 급함, 밤 유지 길다, 새벽 급락
  const h = (hour + 24) % 24;
  const timeMul = 1.0
    + 0.35 * Math.sin((h - 6) * Math.PI / 12)   // 주 곡선: UTC 12 피크
    + 0.10 * Math.sin((h - 6) * Math.PI / 6);    // 보조: 비대칭 보정
  const lambda = VIEW_CONFIG.NEW_VISITOR_RATE * novels.length * timeMul;

  // Poisson 근사: 정수 부분 + 소수 부분 확률
  const guaranteed = Math.floor(lambda);
  const extra = Math.random() < (lambda - guaranteed) ? 1 : 0;
  const count = guaranteed + extra;

  for (let i = 0; i < count; i++) {
    const novel = weightedSelectNovel(novels);
    const reader: VirtualReader = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      novelId: novel.id,
      lastEp: 1,  // 신규는 항상 1화부터
      lastVisitMin: Date.now(),
      returnRate: 0.002 + Math.random() * 0.004,
      bingeDepth: 2 + Math.floor(Math.random() * 3),
      status: 'active',
    };

    // 즉시 정주행 (v3 버그수정: Date.now 비교 제거)
    simulateBingeSession(reader, novel, buffer);
    pool.set(reader.id, reader);
  }

  // 풀 관리
  if (pool.size > VIEW_CONFIG.MAX_POOL_SIZE) {
    prunePool(pool);
  }
}

// ── 기존 독자 재방문 ──
function processReturningReaders(
  pool: Map<string, VirtualReader>,
  novels: Map<string, NovelInfo>,
  buffer: Map<string, number>
): void {
  for (const reader of pool.values()) {
    if (reader.status === 'dormant') continue;

    const novel = novels.get(reader.novelId);
    if (!novel) continue;

    // ── subscribed 독자: 신화 나왔으면 확률적 재방문 ──
    if (reader.status === 'subscribed') {
      if (reader.lastEp < novel.maxEp) {
        // 새 화 나왔다! 60% 확률로 재방문 (GPT: 100%는 비현실적)
        if (Math.random() < VIEW_CONFIG.SUBSCRIBED_RETURN) {
          reader.lastEp++;
          reader.status = 'active';
          simulateBingeSession(reader, novel, buffer);
        }
      }
      continue;
    }

    // ── active 독자: 확률적 재방문 ──
    if (reader.lastEp >= novel.maxEp) {
      reader.status = 'subscribed';
      continue;
    }

    if (Math.random() < reader.returnRate) {
      reader.lastEp++;
      simulateBingeSession(reader, novel, buffer);
    }
  }
}

// ── 풀 정리 (충성 독자 보호) ──
function prunePool(pool: Map<string, VirtualReader>): void {
  // 1. dormant 먼저 삭제
  for (const [id, reader] of pool) {
    if (reader.status === 'dormant') pool.delete(id);
    if (pool.size <= VIEW_CONFIG.MAX_POOL_SIZE * 0.8) return;
  }
  // 2. 가장 오래된 active (오래 안 온 = 이탈한 독자)
  const sortedActive = [...pool.entries()]
    .filter(([, r]) => r.status === 'active')
    .sort((a, b) => a[1].lastVisitMin - b[1].lastVisitMin);
  for (const [id] of sortedActive) {
    pool.delete(id);
    if (pool.size <= VIEW_CONFIG.MAX_POOL_SIZE * 0.8) return;
  }
  // 3. 마지막 수단: 오래된 subscribed (충성 독자는 최후까지 보존)
  const sortedSub = [...pool.entries()]
    .filter(([, r]) => r.status === 'subscribed')
    .sort((a, b) => a[1].lastVisitMin - b[1].lastVisitMin);
  for (const [id] of sortedSub) {
    pool.delete(id);
    if (pool.size <= VIEW_CONFIG.MAX_POOL_SIZE * 0.8) return;
  }
}

// ── 메인: 조회수 업데이트 (1분마다 호출) ──
async function updateViewCounts(): Promise<void> {
  // DB에서 모든 published 에피소드 조회
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

  // ── 소설별 그룹핑 ──
  const novelMap = new Map<string, NovelInfo>();
  for (const ep of result.rows) {
    if (!novelMap.has(ep.novel_id)) {
      const hoursSinceLastEp = ep.latest_ep_at
        ? (now.getTime() - new Date(ep.latest_ep_at).getTime()) / (1000 * 60 * 60)
        : 999;
      novelMap.set(ep.novel_id, {
        id: ep.novel_id,
        maxEp: 0,
        totalViews: 0,
        avgViews: 0,
        hoursSinceLastEp,
        bingeRate: 0,
        commentDensity: 0,
        episodeMap: new Map(),
      });
    }
    const novel = novelMap.get(ep.novel_id)!;
    novel.episodeMap.set(ep.ep, ep.id);
    novel.maxEp = Math.max(novel.maxEp, ep.ep);
    novel.totalViews += (ep.views || 0);
  }

  // 댓글 밀도 조회 (피드백 루프용)
  try {
    const cmtResult = await db.query(`
      SELECT e.novel_id, COUNT(c.id)::int AS cnt
      FROM comments c
      JOIN episodes e ON e.id = c.episode_id
      WHERE c.created_at > NOW() - INTERVAL '7 days'
      GROUP BY e.novel_id
    `);
    for (const row of cmtResult.rows) {
      const novel = novelMap.get(row.novel_id);
      if (novel && novel.totalViews > 0) {
        novel.commentDensity = (row.cnt || 0) / novel.totalViews;
      }
    }
  } catch (e) {
    // 댓글 테이블 접근 실패 시 무시 (density 0 유지)
  }

  // avg, bingeRate 계산
  for (const novel of novelMap.values()) {
    novel.avgViews = novel.episodeMap.size > 0
      ? novel.totalViews / novel.episodeMap.size
      : 0;
    novel.bingeRate = calcBingeRate(novel.totalViews);
  }

  const novels = [...novelMap.values()];

  // ── 독자 풀 초기화 (최초 1회) ──
  if (!readerPool) {
    readerPool = initReaderPool(novels);
  }

  // ── 1. 신규 유입 → 1화부터 정주행 ──
  generateNewVisitors(currentHour, novels, readerPool, carryBuffer);

  // ── 2. 기존/구독 독자 재방문 ──
  processReturningReaders(readerPool, novelMap, carryBuffer);

  // ── 3. carryBuffer → DB UPDATE (fractional carry) ──
  let totalAdded = 0;
  for (const [epId, carry] of carryBuffer.entries()) {
    const addViews = Math.floor(carry);
    if (addViews > 0) {
      await db.query(
        'UPDATE episodes SET views = views + $1 WHERE id = $2',
        [addViews, epId]
      );
      carryBuffer.set(epId, carry - addViews);
      totalAdded += addViews;
    }
  }

  if (totalAdded > 0) {
    const activeCount = [...readerPool.values()].filter(r => r.status === 'active').length;
    const subCount = [...readerPool.values()].filter(r => r.status === 'subscribed').length;
    console.log(`[Views] 📊 +${totalAdded} views | pool: ${readerPool.size} (active:${activeCount} sub:${subCount})`);
  }
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
    // error_type 분류
    const errorMsg = error.message || 'Unknown error';
    let errorType = 'SYSTEM_ERROR';
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      errorType = 'TIMEOUT';
    } else if (errorMsg.includes('content') || errorMsg.includes('invalid')) {
      errorType = 'INVALID_CONTENT';
    }

    // 6. Mark as FAILED + error_type
    await db.query(
      `UPDATE episode_translations 
       SET status = 'FAILED', 
           error_message = $1,
           error_type = $2,
           updated_at = NOW() 
       WHERE id = $3`,
      [errorMsg, errorType, id]
    );

    // 🔄 멱등 쿼터 환불 (quota_refunded = FALSE인 경우에만)
    try {
      const refundCheck = await db.query(
        `SELECT quota_refunded FROM episode_translations WHERE id = $1`,
        [id]
      );
      if (refundCheck.rows[0] && !refundCheck.rows[0].quota_refunded) {
        await refundTranslationQuota(job.author_id);
        await db.query(
          `UPDATE episode_translations SET quota_refunded = TRUE WHERE id = $1`,
          [id]
        );
        console.log(`[Worker] 💰 Quota refunded for author ${job.author_id}`);
      }
    } catch (refundErr) {
      console.error(`[Worker] ⚠️ Refund failed:`, refundErr);
    }

    console.error(`[Worker] ❌ ${language} failed for ${novel_id}/${episode_id}: [${errorType}] ${errorMsg}`);
  }
}

// ============================================================
// 댓글-조회수 상관관계 v4 — 확률 기반 행동 모사
// ============================================================

// ── Poisson 샘플러 (Knuth 알고리즘) ──
function poissonSample(λ: number): number {
  if (λ <= 0) return 0;
  if (λ < 30) {
    const L = Math.exp(-λ);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }
  // λ ≥ 30: 정규 근사
  return Math.max(0, Math.round(λ + Math.sqrt(λ) * gaussianRandom()));
}

function gaussianRandom(): number {
  const u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── 소설별 Quality Latent Variable Q (log-normal + drift) ──
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function generateNovelQ(novelId: string): number {
  const hash = simpleHash(novelId);
  // log-normal 분포: 대부분 mediocre, 소수 고품질, 극소수 폭발
  const u1 = ((hash % 10000) + 1) / 10001;          // (0,1) 균등
  const u2 = (((hash * 7919) % 10000) + 1) / 10001;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const base = Math.exp(-0.15 + 0.45 * z);  // μ=-0.15, σ=0.45 → median ≈ 0.86

  // 느린 drift: 월 단위 ±5%
  const monthsSinceEpoch = Math.floor(Date.now() / (30 * 86400000));
  const drift = Math.sin(hash + monthsSinceEpoch * 0.3) * 0.05;

  return Math.max(0.2, Math.min(3.0, base + drift));
}

// ── Batch-level jitter (워커 실행 단위로 고정) ──
let batchK = 0.08;
let batchB = 0.55;
let lastBatchJitterTime = 0;

function refreshBatchJitter(): void {
  const now = Date.now();
  // 1시간마다 갱신 (같은 batch 내에선 고정)
  if (now - lastBatchJitterTime > 3600_000) {
    batchK = 0.08 * (0.85 + Math.random() * 0.30);  // ±15%
    batchB = 0.55 * (0.90 + Math.random() * 0.20);  // ±10%
    lastBatchJitterTime = now;
  }
}

// ── 핵심 모델: λ = Q × k × views^(1-b) × D(ep) × A(age) ──
function sampleCommentCount(
  views: number, epNumber: number, daysSince: number, Q: number
): number {
  if (views <= 0) return 0;

  refreshBatchJitter();

  // 감쇠 팩터
  const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
  const A = epNumber <= 3
    ? Math.max(0.7, 1 / (1 + 0.01 * daysSince))
    : 1 / (1 + 0.15 * daysSince);

  // λ 계산
  let λ = Q * batchK * Math.pow(views, 1 - batchB) * D * A;

  // Activation threshold: 매우 낮은 조회수 억제
  if (views < 15) {
    λ *= 0.3;
  } else if (views < 30) {
    λ *= 0.6;
  }

  // 비율 상한 (최대 2%)
  λ = Math.min(λ, views * 0.02);

  // Poisson 샘플링
  return poissonSample(λ);
}

// ── 댓글 기대값 모델 파라미터 — lib/comment-bot-model.ts에서 import
const ENGAGEMENT_RATE = MODEL_PARAMS.ENGAGEMENT_RATE;
const CUM_BOT_RATIO = MODEL_PARAMS.CUM_BOT_RATIO;
const MAX_COMMENT_CAP_BASE = MODEL_PARAMS.MAX_COMMENT_CAP_BASE;
const CUM_LAMBDA = MODEL_PARAMS.CUM_LAMBDA;
const CUM_T0 = MODEL_PARAMS.CUM_T0;
const VIEW_DRIFT_MAX_MULTIPLIER = MODEL_PARAMS.VIEW_DRIFT_MAX_MULTIPLIER;
const BACKFILL_ENTRY_THRESHOLD = MODEL_PARAMS.BACKFILL_ENTRY_THRESHOLD;
const BACKFILL_EXIT_THRESHOLD = MODEL_PARAMS.BACKFILL_EXIT_THRESHOLD;
const ONGOING_CYCLE_FACTOR = MODEL_PARAMS.ONGOING_CYCLE_FACTOR;
const MAX_BACKFILL_PER_EPISODE = MODEL_PARAMS.MAX_BACKFILL_PER_EPISODE;

// views_eff: view bot + comment bot 강화 루프 방지 (급격한 views 반영 억제)
const viewsCache = new Map<string, number>(); // episodeId → 이전 cycle views
function getViewsEff(episodeId: string, views: number): number {
  const prev = viewsCache.get(episodeId) ?? views;
  const eff = Math.min(views, prev * VIEW_DRIFT_MAX_MULTIPLIER);
  viewsCache.set(episodeId, eff);
  return eff;
}

function calcCumulativeTarget(
  views: number, epNumber: number, daysSince: number, episodeId: string
): { totalTarget: number; botTarget: number } {
  if (views <= 0) return { totalTarget: 0, botTarget: 0 };

  // ep-index 감쇠 (ep1=1.0, ep10=0.53, ep20=0.32)
  const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));

  // view drift 방지
  const views_eff = getViewsEff(episodeId, views);

  // ep-aware cap: 후반 에피소드일수록 상한도 낮아짐
  const cap = MAX_COMMENT_CAP_BASE * D;
  const C_max = Math.min(ENGAGEMENT_RATE * views_eff * D, cap);

  const saturation = 1 - Math.exp(-CUM_LAMBDA * (daysSince + CUM_T0));
  const totalTarget = C_max * saturation;

  const minBot = daysSince < 0.1 ? 1 : 0;
  const botTarget = Math.max(minBot, Math.floor(totalTarget * CUM_BOT_RATIO));

  return { totalTarget, botTarget };
}


// ── Gini Guard (연속 감쇠) ──
function giniGuardMultiplier(novels: NovelInfo[]): number {
  if (novels.length < 3) return 1.0;
  const sorted = novels.map(n => n.totalViews).sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total <= 0) return 1.0;
  const top10pct = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.1)));
  const top10sum = top10pct.reduce((a, b) => a + b, 0);
  const concentration = top10sum / total;
  // 연속 지수 감쇠: threshold 0.5 초과 시 부드럽게 억제
  if (concentration <= 0.5) return 1.0;
  return Math.exp(-3 * (concentration - 0.5));  // 0.6→0.74, 0.7→0.55, 0.8→0.41
}

// ── 댓글 밀도 → 조회수 부스트 (피드백 루프) ──
function commentDensityBoost(recentComments: number, totalViews: number): number {
  if (totalViews <= 0) return 1.0;
  const density = recentComments / totalViews;
  // log 스케일, 최대 +10%
  return 1 + Math.min(0.10, Math.log10(density * 100 + 1) * 0.05);
}

/**
 * Worker 메인 루프
 */

// ── 언어별 기본 가중치 (글로벌 웹소설 독자 분포) ──
const LANG_BASE_WEIGHTS: Record<string, number> = {
  'ko': 0.50,   // 한국어 (50±8% 목표 → 실제 42~58%)
  'en': 0.25,   // 영어권
  'ja': 0.14,   // 일본어권
  'zh': 0.07,   // 중국어권
  'es': 0.04,   // 스페인어권
};

// 가중치에 ±8% 랜덤 지터 → 에피소드마다 자연스러운 비율 변동
function jitteredWeights(): Record<string, number> {
  const jittered: Record<string, number> = {};
  let total = 0;
  for (const [lang, base] of Object.entries(LANG_BASE_WEIGHTS)) {
    const jitter = 0.92 + Math.random() * 0.16; // ±8%
    jittered[lang] = base * jitter;
    total += jittered[lang];
  }
  // 정규화 (합 = 1.0)
  for (const lang of Object.keys(jittered)) {
    jittered[lang] /= total;
  }
  return jittered;
}

// ── Race condition 방지: 이전 실행 중이면 skip ──
let commentBotRunning = false;

// ── 최근 실패 에피소드 추적: episodeId → 마지막 실패 시각 ──
const recentFailures = new Map<string, number>();
const FAILURE_SKIP_MS = 60 * 60 * 1000; // 1시간 skip

// ── bot 댓글 비율 (전체 target 중 봇이 채워야 하는 비율) ──
const BOT_RATIO = 0.7;

// ── 5분 주기 실행 한 번에 처리할 최대 에피소드 수 ──
const MAX_EPISODES_PER_RUN = 15;

// ── 댓글 자동 생성 (5분 주기, 조회수 기반 Poisson 모델) ──
async function autoGenerateComments(): Promise<void> {
  // ① Race condition 방지
  if (commentBotRunning) {
    console.log('[CommentBot] ⏭ Previous run still active, skipping');
    return;
  }
  commentBotRunning = true;

  try {
    // ③ 봇 댓글만 카운트 (유저 댓글은 별도 집계)
    const result = await db.query(`
      SELECT e.id AS episode_id, e.novel_id, e.ep, e.created_at,
             e.views,
             COALESCE(bc.bot_cnt, 0)  AS bot_count,
             COALESCE(uc.user_cnt, 0) AS user_count
      FROM episodes e
      JOIN novels n ON e.novel_id = n.id
      LEFT JOIN (
        SELECT c.episode_id, COUNT(*) AS bot_cnt
        FROM comments c JOIN users u ON c.user_id = u.id
        WHERE u.role = 'bot'
        GROUP BY c.episode_id
      ) bc ON bc.episode_id = e.id
      LEFT JOIN (
        SELECT c.episode_id, COUNT(*) AS user_cnt
        FROM comments c JOIN users u ON c.user_id = u.id
        WHERE u.role != 'bot'
        GROUP BY c.episode_id
      ) uc ON uc.episode_id = e.id
      WHERE e.status = 'published'
        AND n.deleted_at IS NULL
      ORDER BY e.created_at ASC
      LIMIT 200
    `);

    if (result.rows.length === 0) return;

    // ⑥ gap 계산 후 큰 것 우선 정렬, MAX_EPISODES_PER_RUN개만 처리
    const now = Date.now();
    const candidates: Array<{
      episode_id: string; novel_id: string; ep: number;
      publishedAt: Date; viewCount: number; botCount: number;
      userCount: number; toAdd: number;
    }> = [];

    for (const row of result.rows) {
      const { episode_id, novel_id, ep, created_at } = row;

      // ② 최근 실패 에피소드 skip
      const lastFail = recentFailures.get(episode_id);
      if (lastFail && now - lastFail < FAILURE_SKIP_MS) continue;

      const publishedAt = new Date(created_at);
      const viewCount = parseInt(row.views) || 0;
      const botCount = parseInt(row.bot_count) || 0;
      const userCount = parseInt(row.user_count) || 0;
      const epNumber = parseInt(ep) || 1;
      const daysSince = Math.floor((now - publishedAt.getTime()) / 86400000);
      const Q = generateNovelQ(novel_id);

      // 공유 모델(comment-bot-model.ts) 사용 — views_eff를 DB에도 저장해 대시보드와 동기화
      const views_eff = getViewsEff(episode_id, viewCount);
      const botTarget = calcBotTarget(views_eff, epNumber, daysSince);

      // non-blocking DB 쾬시 쓰기 (대시보드 동기화용)
      db.query(
        'UPDATE episodes SET views_eff=$1, bot_target=$2 WHERE id=$3',
        [views_eff, botTarget, episode_id]
      ).catch(() => { });

      const gap = Math.max(0, botTarget - botCount);

      if (gap <= 0) continue;

      // ── Backfill / Ongoing 모드 분기 ──
      // 진입: actual < target×0.8 → backfill (소급 전량, burst 제한 40/사이클)
      // 종료: actual ≥ target×0.9 → ongoing (15% Poisson 티클링)
      // 완충 구간 [80%~90%]: 이미 backfill이면 계속, ongoing이면 그대로
      const fillRatio = botTarget > 0 ? botCount / botTarget : 1;
      const isBackfill = fillRatio < BACKFILL_ENTRY_THRESHOLD;
      const isOngoing = fillRatio >= BACKFILL_EXIT_THRESHOLD;

      let toAdd: number;
      if (isBackfill) {
        // 소급: gap 전량, 단 한 사이클에 40개 제한
        toAdd = Math.min(gap, MAX_BACKFILL_PER_EPISODE);
      } else if (isOngoing) {
        // 자연스러운 점진 추가
        toAdd = Math.min(poissonSample(Math.max(1, Math.round(gap * ONGOING_CYCLE_FACTOR))), gap);
      } else {
        // 완충 구간: 양쪽 율 절충
        toAdd = Math.min(Math.ceil(gap * 0.5), MAX_BACKFILL_PER_EPISODE);
      }

      if (toAdd <= 0) continue;
      candidates.push({ episode_id, novel_id, ep: epNumber, publishedAt, viewCount, botCount, userCount, toAdd });
    }

    // gap 큰 것부터
    candidates.sort((a, b) => b.toAdd - a.toAdd);
    const toProcess = candidates.slice(0, MAX_EPISODES_PER_RUN);

    let totalAdded = 0;

    for (const { episode_id, novel_id, ep, publishedAt, toAdd } of toProcess) {
      const weights = jitteredWeights();
      const langAllocations: { lang: string; count: number }[] = [];
      let allocated = 0;
      const langs = Object.keys(weights);
      for (let i = 0; i < langs.length; i++) {
        const lang = langs[i];
        const isLast = i === langs.length - 1;
        const count = isLast ? toAdd - allocated : Math.round(toAdd * weights[lang]);
        if (count > 0) { langAllocations.push({ lang, count }); allocated += count; }
      }

      const { botTarget } = calcCumulativeTarget(
        toProcess.find(x => x.episode_id === episode_id)?.viewCount ?? 0,
        ep, Math.floor((now - publishedAt.getTime()) / 86400000),
        episode_id
      );
      console.log(
        `[CommentBot] ep${ep}: views=${toProcess.find(x => x.episode_id === episode_id)?.viewCount ?? 0} `
        + `botTarget=${botTarget} actual=${toProcess.find(x => x.episode_id === episode_id)?.botCount ?? 0} `
        + `adding=${toAdd} [${langAllocations.map(a => `${a.lang}:${a.count}`).join(' ')}]`
      );


      // 타임슬롯 생성
      const spanMs = now - publishedAt.getTime();
      const allTimestamps: Date[] = [];
      for (let n = 0; n < toAdd; n++) {
        const roll = Math.random();
        let offsetMs: number;
        if (spanMs <= 0) {
          offsetMs = (1 + Math.random() * 14) * 60 * 1000;
          allTimestamps.push(new Date(now + offsetMs));
        } else if (roll < 0.50) {
          const first24h = Math.min(spanMs, 24 * 3600 * 1000);
          offsetMs = Math.random() * first24h;
          allTimestamps.push(new Date(publishedAt.getTime() + offsetMs));
        } else if (roll < 0.75) {
          const first7d = Math.min(spanMs, 7 * 24 * 3600 * 1000);
          offsetMs = 24 * 3600 * 1000 + Math.random() * (first7d - 24 * 3600 * 1000);
          if (offsetMs < 0) offsetMs = Math.random() * spanMs;
          allTimestamps.push(new Date(publishedAt.getTime() + offsetMs));
        } else {
          offsetMs = Math.random() * spanMs;
          allTimestamps.push(new Date(publishedAt.getTime() + offsetMs));
        }
      }
      // Fisher-Yates shuffle
      for (let i = allTimestamps.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allTimestamps[i], allTimestamps[j]] = [allTimestamps[j], allTimestamps[i]];
      }

      // ⑤ 언어별 타임슬롯 사전 분배 (shared slotOffset 버그 방지)
      const langTsMap: { lang: string; count: number; timestamps: Date[] }[] = [];
      let slotOffset = 0;
      for (const { lang, count } of langAllocations) {
        langTsMap.push({ lang, count, timestamps: allTimestamps.slice(slotOffset, slotOffset + count) });
        slotOffset += count;
      }

      // Promise.allSettled로 언어 병렬 실행
      let episodeAdded = 0;
      let episodeFailed = false;

      await Promise.allSettled(langTsMap.map(async ({ lang, count, timestamps }) => {
        try {
          // 한국어는 예전 전용 한국어 봇 로직 사용
          if (lang === 'ko') {
            const botResult = await runKoreanCommentBot(
              novel_id, count, episode_id, true, publishedAt, timestamps,
            );
            episodeAdded += botResult.inserted;
            totalAdded += botResult.inserted;
          } else {
            const langPack = await loadLangPack(lang);
            const botResult = await runCommentBotIntl(
              novel_id, langPack, count, 1.0, true,
              episode_id, true, publishedAt, [], timestamps,
            );
            episodeAdded += botResult.inserted;
            totalAdded += botResult.inserted;
          }
        } catch (langErr) {
          console.error(`[CommentBot]   ⚠️ ${lang} failed:`, langErr);
          if (lang === 'ko') {
            console.error(`[CommentBot] 🔴 Korean bot full error:`, (langErr as Error)?.stack || langErr);
          }
          episodeFailed = true;
        }
      }));

      // ② 실패 기록
      if (episodeFailed && episodeAdded === 0) {
        recentFailures.set(episode_id, now);
        console.warn(`[CommentBot]   ⚠️ ep${ep} all languages failed → skip for 1h`);
      }

      // 에피소드 간 1초 대기 (언어 병렬화로 3초 불필요)
      await new Promise(r => setTimeout(r, 1000));
    }

    if (totalAdded > 0) {
      console.log(`[CommentBot] ✅ Total: ${totalAdded} comments added`);
    }
  } finally {
    commentBotRunning = false;
  }
}

// ── 예약 댓글 공개 (1분 주기) ──
async function revealScheduledComments(): Promise<void> {
  const result = await db.query(`
    UPDATE comments SET is_hidden = FALSE
    WHERE id IN (
      SELECT id FROM comments
      WHERE is_hidden = TRUE
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 5
    )
    RETURNING id
  `);

  if (result.rows.length > 0) {
    console.log(`[Reveal] 👁 ${result.rows.length} comments revealed`);
  }
}

async function main() {
  // 환경 변수 확인
  if (!process.env.OPENAI_API_KEY) {
    console.error('[Worker] ❌ Missing environment variable: OPENAI_API_KEY');
    process.exit(1);
  }

  await initDb();
  console.log('[Worker] 🚀 Translation Worker Started');
  console.log('[Worker] 🐍 Using Python translation_core (Pipeline merged)');
  console.log(`[Worker] ⚡ Parallel mode: max ${MAX_CONCURRENCY} per episode`);
  console.log('[Worker] ⏰ Scheduler: checking every 60s for scheduled episodes');
  console.log('[Worker] 💬 CommentBot: checking every 5min for commentless episodes');
  console.log('[Worker] 👁 Reveal: checking every 60s for scheduled comments');
  console.log('[Worker] 👀 Watching for PENDING jobs...\n');

  let lastScheduleCheck = 0;
  let lastViewsUpdate = 0;
  let lastCommentBot = 0;
  let lastReveal = 0;

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

      // ── 3. 댓글 자동 생성 (5분마다) ──
      if (Date.now() - lastCommentBot > 300_000) {
        try {
          await autoGenerateComments();
        } catch (err) {
          console.error('[CommentBot] ⚠️ Error:', err);
        }
        lastCommentBot = Date.now();
      }

      // ── 4. 예약 댓글 공개 (1분마다) ──
      if (Date.now() - lastReveal > 60_000) {
        try {
          await revealScheduledComments();
        } catch (err) {
          console.error('[Reveal] ⚠️ Error:', err);
        }
        lastReveal = Date.now();
      }

      // ── 5. 번역 작업 폴링 ──
      const jobs = await fetchAndClaimNextJobs(MAX_CONCURRENCY);

      if (jobs.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      if (jobs.length > 1) {
        console.log(`[Worker] 🚀 Parallel batch: ${jobs.length} jobs (${jobs.map(j => j.language).join(', ')})`);
      }
      await Promise.allSettled(jobs.map((job, i) => processJobWithStagger(job, i)));

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
