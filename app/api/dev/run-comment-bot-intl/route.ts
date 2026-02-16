/**
 * 다국어 댓글봇 라우터
 * GET /api/dev/run-comment-bot-intl?novel=novel-xxx&lang=en&count=60&deep=true
 * GET /api/dev/run-comment-bot-intl?novel=novel-xxx&lang=en&mode=batch  (전체 에피소드 자동)
 * 
 * 한국어 route.ts는 절대 건드리지 않음.
 * 이 엔드포인트는 en/ja/zh/es만 처리.
 */

import { NextResponse, NextRequest } from "next/server";
import { requireAdmin } from "../../../../lib/admin";
import { runCommentBotIntl, runCommentBotBatch } from "./engine";
import type { LanguagePack } from "./types";

// ============================================================
// 언어팩 레지스트리
// ============================================================
const LANGUAGE_PACKS: Record<string, () => Promise<LanguagePack>> = {
    'en': () => import('./lang/en').then(m => m.default),
    'ja': () => import('./lang/ja').then(m => m.default),
    'zh': () => import('./lang/zh').then(m => m.default),
    'es': () => import('./lang/es').then(m => m.default),
};

const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_PACKS);

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const novelId = searchParams.get('novel');
    const langCode = searchParams.get('lang') || 'en';
    const mode = searchParams.get('mode') || 'single';
    const baseCount = parseInt(searchParams.get('count') || '60');
    const density = parseFloat(searchParams.get('density') || '1.0');
    const useDeep = searchParams.get('deep') !== 'false';

    // === 검증 ===
    if (!novelId) {
        return NextResponse.json(
            { error: 'novel parameter required' },
            { status: 400 }
        );
    }

    if (langCode === 'ko') {
        return NextResponse.json(
            { error: 'Korean uses /api/dev/run-comment-bot (existing endpoint).' },
            { status: 400 }
        );
    }

    if (!SUPPORTED_LANGUAGES.includes(langCode)) {
        return NextResponse.json(
            { error: `Unsupported language: ${langCode}`, supported: SUPPORTED_LANGUAGES },
            { status: 400 }
        );
    }

    try {
        const loadLangPack = LANGUAGE_PACKS[langCode];
        const langPack = await loadLangPack();

        console.log(`🌐 [intl] Language: ${langCode}, mode: ${mode}`);

        // 🔥 배치/백필 모드: 전체 에피소드 순회
        if (mode === 'batch' || mode === 'backfill') {
            const isBackfill = mode === 'backfill';
            const result = await runCommentBotBatch(novelId, langPack, isBackfill);
            return NextResponse.json({
                success: true,
                mode,
                novel: novelId,
                language: langCode,
                totalInserted: result.totalInserted,
                episodes: result.episodes,
                version: 'v4-batch',
            });
        }

        // 기존 단일 에피소드 모드
        const result = await runCommentBotIntl(
            novelId,
            langPack,
            baseCount,
            density,
            useDeep,
        );

        return NextResponse.json({
            success: true,
            mode: 'single',
            novel: novelId,
            language: langCode,
            dataMaturity: langPack.dataMaturity,
            contentLanguage: result.contentLanguage,
            episodeIds: result.episodeIds,
            commentsPosted: result.inserted,
            deepContextUsed: result.deepContextUsed,
            detectedTags: result.detectedTags,
            version: 'v4-intl',
        });
    } catch (error) {
        console.error('[intl] Comment Bot Error:', error);
        return NextResponse.json(
            { error: 'Failed to run comment bot', details: String(error), language: langCode },
            { status: 500 }
        );
    }
}
