/**
 * 다국어 댓글봇 — 공통 타입 정의
 * 
 * 한국어 route.ts의 구조를 그대로 따르되,
 * 언어별 데이터/문자열 로직은 LanguagePack으로 분리.
 */

// ============================================================
// 기본 타입 (한국어 route.ts 동일)
// ============================================================

export type PersonalityTone = 'short_reactor' | 'emotional' | 'theorist' | 'cheerleader' | 'critic';

export type ReaderType = 'immersed' | 'skimmer' | 'overreactor' | 'analyst' | 'troll' | 'misreader' | 'lurker';

export interface StoryEvent {
    id: number;
    summary: string;
    type: string;         // 'action' | 'emotion' | 'dialogue' | 'twist' | 'reveal'
    importance: number;   // 0.0 ~ 1.0
    characters: string[];
    quote?: string;
    detail?: string;
}

export interface EventExtraction {
    events: StoryEvent[];
    dominantEmotion: string;
}

export interface ReaderProfile {
    type: ReaderType;
    personaId: string;
    personaTone: string;
    personaStyle: string;
    personaEndings: string[];
    personaCognitive: string;
    attentionSpan: number;
    memoryNoise: number;
    emotionalIntensity: number;
    literacy: number;
    sarcasmLevel: number;
    bandwagonTarget?: string;
    dominantEmotion?: string;
}

export interface PersonaDef {
    id: string;
    name: string;
    baseType: ReaderType;
    callGroup: 'immersed' | 'overreactor' | 'chaos' | 'casual';
    tone: string;
    style: string;
    endings: string[];
    cognitiveFocus: string;
}

export interface ContextTemplate {
    template: string;
    tone: PersonalityTone;
}

// ============================================================
// LanguagePack — 언어별 데이터 + 문자열 로직
// ============================================================

export interface LanguagePack {
    code: string;                    // 'en' | 'ja' | 'zh' | 'es'
    dataMaturity: 'EXPERIMENTAL' | 'PRODUCTION';

    // === 데이터 풀 ===
    nicknamePool: string[];
    templates: Record<PersonalityTone, string[]>;
    genreTemplates: Record<string, string[]>;


    // === 30 페르소나 (문화 적응) ===
    personas: PersonaDef[];

    // === 페르소나 비율 오버라이드 (문화권별 callGroup 비율 조정) ===
    genrePersonaWeightOverride?: Record<string, Partial<{
        chaosRatio: number;
        casualRatio: number;
        overreactorRatio: number;
        immersedRatio: number;
        analystRatio: number;
    }>>;

    // === 장르별 personalityTone 분포 ===
    genreWeights: Record<string, { tone: PersonalityTone; weight: number }[]>;
    defaultWeights: { tone: PersonalityTone; weight: number }[];

    // === 댓글 개수 가중치 (봇당) ===
    commentCountWeights: { count: number; weight: number }[];

    // === 플랫폼 문자열 (call1~5 프롬프트에 사용) ===
    platformString: string;

    // === extractEvents 프롬프트 (contentLanguage 기반) ===
    extractEventsPrompt: (trimmedContent: string) => string;

    // === 프롬프트 빌더 ===
    buildCall1Prompt: (args: CallPromptArgs) => string | null;
    buildCall2Prompt: (args: CallPromptArgs) => string | null;
    buildCall3Prompt: (args: CallPromptArgs) => string | null;
    buildCall4Prompt: (args: CallPromptArgs) => string | null;
    buildCall5Prompt: (args: CallPromptArgs) => string;
    buildReplyPrompt: (parentComment: string) => string;

    // === 후처리 (모든 문자열 조작 = 언어팩) ===
    humanize: (comment: string) => string;
    applyDynamicVariations: (text: string) => string;
    curateScoring: (comment: string) => { score: number };

    // === Curator 프롬프트 (언어별 커뮤니티 페르소나) ===
    curatorPrompt?: (commentList: string, targetCount: number) => string;

    // === 군집/감정 (문자열 → 언어팩) ===
    extractKeyword: (text: string) => string | null;
    herdEchoTemplates: (keyword: string) => string[];
    herdCounterTemplates: (keyword: string) => string[];
    highEmotionPattern: RegExp;
    emotionBoosters: string[];

    // === 왜곡 (문자열 → 언어팩) ===
    distortEventText: (summary: string) => string;
    distortInterpretation: (summary: string, characters: string[]) => string;

    // === 파싱 ===
    stripLabel: (comment: string) => string;
    minCommentLength: number;
    maxCommentLength: number;
    midDensityRange: [number, number];   // [min, max] 글자 수

    // === 후처리 노이즈 (curateWithGPT5 내 Stage 8) ===
    applyPostNoise: (text: string) => string;

    // === 토크나이저 (optional, 의미 중복 탐지용) ===
    tokenize?: (text: string) => string[];
}

// ============================================================
// 프롬프트 빌더 인자
// ============================================================

export interface CallPromptArgs {
    platform: string;
    moodHint: string;
    genreHint: string;
    episodeExcerpt: string;
    sceneContext: string;
    readerViews: {
        profile: ReaderProfile;
        view: string;
    }[];
    primaryGenre: string;
    targetCommentCount: number;
}

// ============================================================
// 엔진에서 사용하는 내부 타입
// ============================================================

export interface CommentBotResult {
    inserted: number;
    episodeIds: string[];
    deepContextUsed: boolean;
    detectedTags: string[];
    language: string;
    contentLanguage: string;  // 실제 사용된 텍스트 언어 (fallback 시 'ko')
}
