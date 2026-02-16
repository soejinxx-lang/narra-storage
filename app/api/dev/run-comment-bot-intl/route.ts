/**
 * 다국어 댓글봇 라우터
 * GET /api/dev/run-comment-bot-intl?novel=novel-xxx&lang=en&count=60&deep=true
 * 
 * 한국어 route.ts는 절대 건드리지 않음.
 * 이 엔드포인트는 en/ja/zh/es만 처리.
 */

import { NextResponse, NextRequest } from "next/server";
import { requireAdmin } from "../../../../lib/admin";
import { runCommentBotIntl } from "./engine";
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
    const baseCount = parseInt(searchParams.get('count') || '60');
    const density = parseFloat(searchParams.get('density') || '1.0');
    const useDeep = searchParams.get('deep') !== 'false'; // default: true

    // === 검증 ===
    if (!novelId) {
        return NextResponse.json(
            { error: 'novel parameter required' },
            { status: 400 }
        );
    }

    if (langCode === 'ko') {
        return NextResponse.json(
            { error: 'Korean uses /api/dev/run-comment-bot (existing endpoint). This endpoint is for en/ja/zh/es only.' },
            { status: 400 }
        );
    }

    if (!SUPPORTED_LANGUAGES.includes(langCode)) {
        return NextResponse.json(
            {
                error: `Unsupported language: ${langCode}`,
                supported: SUPPORTED_LANGUAGES,
                hint: 'Language packs are added in Phase 2. Currently no language packs are registered.',
            },
            { status: 400 }
        );
    }

    try {
        // 언어팩 로딩 (동적 import)
        const loadLangPack = LANGUAGE_PACKS[langCode];
        const langPack = await loadLangPack();

        console.log(`🌐 [intl] Language: ${langCode} (maturity: ${langPack.dataMaturity})`);

        const result = await runCommentBotIntl(
            novelId,
            langPack,
            baseCount,
            density,
            useDeep,
        );

        return NextResponse.json({
            success: true,
            novel: novelId,
            language: langCode,
            dataMaturity: langPack.dataMaturity,
            contentLanguage: result.contentLanguage,
            episodeIds: result.episodeIds,
            commentsPosted: result.inserted,
            deepContextUsed: result.deepContextUsed,
            detectedTags: result.detectedTags,
            azureConfigured: !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY),
            version: 'v3-intl',
        });
    } catch (error) {
        console.error('[intl] Comment Bot Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to run comment bot',
                details: String(error),
                language: langCode,
            },
            { status: 500 }
        );
    }
}
