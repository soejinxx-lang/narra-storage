"use strict";
/**
 * Translation Worker
 *
 * PENDING 상태의 번역 작업을 순차적으로 처리하는 상주 프로세스
 * - DB에서 PENDING 작업 폴링
 * - Pipeline API 호출
 * - 상태 업데이트 (RUNNING → DONE/FAILED)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importStar(require("../app/db"));
const chunker_1 = require("./chunker");
const translate_1 = require("./translate");
/**
 * Fetch and claim the next pending job atomically
 * Also reclaims jobs stuck in RUNNING for more than 15 minutes (dead worker recovery)
 */
async function fetchAndClaimNextJob() {
    const result = await db_1.default.query(`
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
async function translateChunk(chunkText, language, novelId, chunkIndex) {
    const MAX_RETRIES = 3;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Call Python translation pipeline directly (no HTTP)
            const translatedText = await (0, translate_1.translateWithPython)({
                novelTitle: novelId,
                text: chunkText,
                sourceLanguage: 'ko',
                targetLanguage: language
            });
            return translatedText;
        }
        catch (error) {
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
async function processJob(job) {
    const { id, episode_id, language, novel_id, content } = job;
    try {
        console.log(`[Worker] 📝 Processing ${language} for ${novel_id}/${episode_id}...`);
        // 0. Mark as PROCESSING
        await db_1.default.query(`UPDATE episode_translations 
       SET status = 'PROCESSING', 
           updated_at = NOW() 
       WHERE id = $1`, [id]);
        // 1. Split text into chunks
        const chunks = (0, chunker_1.splitIntoChunks)(content, 2500);
        console.log(`[Worker] 📦 Split into ${chunks.length} chunks`);
        // 2. Translate each chunk sequentially (preserves context)
        const translatedChunks = [];
        for (const chunk of chunks) {
            console.log(`[Worker] 🔄 Translating chunk ${chunk.index + 1}/${chunks.length} (${chunk.charCount} chars)...`);
            const result = await translateChunk(chunk.text, language, novel_id, chunk.index);
            translatedChunks.push(result);
        }
        // 3. Merge results (preserves original structure)
        const finalText = translatedChunks.join('');
        // 4. Save to DB (DONE status)
        await db_1.default.query(`UPDATE episode_translations 
       SET translated_text = $1, 
           status = 'DONE', 
           updated_at = NOW() 
       WHERE id = $2`, [finalText, id]);
        console.log(`[Worker] ✅ ${language} completed for ${novel_id}/${episode_id}`);
    }
    catch (error) {
        // 5. Mark as FAILED
        await db_1.default.query(`UPDATE episode_translations 
       SET status = 'FAILED', 
           error_message = $1, 
           updated_at = NOW() 
       WHERE id = $2`, [error.message || 'Unknown error', id]);
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
    await (0, db_1.initDb)();
    console.log('[Worker] 🚀 Translation Worker Started');
    console.log('[Worker] 🐍 Using Python translation_core (Pipeline merged)');
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
        }
        catch (error) {
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
