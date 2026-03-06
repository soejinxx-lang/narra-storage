import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

/**
 * 댓글봇 v3 — Deep Context GPT + 태그 기반 + 수집 데이터
 * GET /api/dev/run-comment-bot?novel=novel-xxx&count=60&deep=true
 * 
 * 17가지 규칙 + GPT 피드백 + 후처리 왜곡 + context-required 치환
 * + 장면 앵커 GPT 생성 + 태그 기반 장면 매칭
 * 수집 데이터: 400+ 닉네임, 300+ 템플릿, 77 context, 70+ 태그 템플릿
 */

type PersonalityTone = 'short_reactor' | 'emotional' | 'theorist' | 'cheerleader' | 'critic';

// ============================================================
// 실제 수집 닉네임 (카카오페이지, 네이버시리즈 등 — 295개 중 선별)
// ============================================================
const NICKNAME_POOL = [
    // 카카오페이지 수집
    '화나면짖는개', '소설사냥꾼', 'December', 'Walsan', '곰_769',
    'Dsxgyuh', '밍밍이_514', '김고백', '엔내', '나건우_524',
    // 네이버시리즈 수집
    '하숲', '한을꽃', 'TunaPas', '파스타맛로제소스', '순애의종류',
    '인간탐구중', '공화춘', '간나바로', '편식금지',
    // 3차 수집
    '부겐빌', '오늘도죽는보스', '부끄러운취향', '지나가는레콘',
    '해엄치는새', '크레센도몰토', '므에에엑', '무지개맛비둘기',
    '소녀의마음은별빛', '몽설화', '태양최고', '바라라란', '별의별',
    // 6차 수집
    '말리지마', 'cookie', '아이고아이고', '쉬어라', '에고머니나',
    '유스티티아', '잔아옹', '봉봉기릿', '하루', '라라라라라',
    '꺼어억', '네티즌', '리버스', '두기', '아일렙', '로알망고',
    // 씹덕물 수집
    '잠유류', '케이건 드라카', '이과혼', '장부이', '멍꽁이',
    '치킨발골전문가', '기억안의너', '인생업적개념글', '너구리_892',
    '아빠소', '애미야국이짜다',
    // 영+숫자 혼합
    'lockette3', 'JS', 'OxOb', 'Lcsuisea', 'ted', 'Zzxe', 'whd',
    'yuh', '2yeon1', 'JB123', 'xksnw1', 'Evenoa', 'Ertqazplm',
    'binsah', 'JoeyValence', '심심함772', '뉴우비', '전생술',
    '가위치기연구소', '고구마패스', '메밀소밀', '타임로드',
    '오오지금감니다', '미오양2', '혼돈파괴망가아악',
    // PIA 스타일 (카카오페이지 자동생성)
    'PIA1619742997828', 'PIA1754845395185',
    // 추가
    '끝이아닌시작', '88m', '하Lin', '무공천마',
    '식료1weng', '박영기',
];

// ============================================================
// 실제 수집 댓글 템플릿 — tone별 분류 (233개 중 선별)
// ============================================================
const TEMPLATES: Record<PersonalityTone, string[]> = {
    // 55% — 짧은 리액션, 비명, 밈, 초성체
    short_reactor: [
        // 초단문 (1-5자)
        'ㄷㄷ', 'ㅋㅋ', '헐', '👍', '뚝!', '??', 'ㅅㅂ', 'ㄹㅇ',
        'ㅇㅈ', '인정', '크', 'ㅁㅊ', '레전드', 'ㅇㅇ', '굿',
        '1', '6등',
        // 비명/혼란
        '끼에에에에엑!!!!', '?????????????????',
        // 감탄사 + 후속
        '와 이건좋네ㅋㅋ', '오 이거괜찮은데?', '와ㅋㅋㅋ', '헐ㄷㄷ',
        '오 좋은데', '와 이건좀', '헐 진짜?', '오 그래?',
        // 반응
        '이거시 현실', '참고 본다',
        '바로 뚝배기 시원하게 깨버리네ㅋㅋㅋㅋ',
        '역대급이네ㄷㄷ', '카..오랜만에 뽕차네',
        'nice ㅇㅈ', 'ㅋㅋㅋㅋ', '굿굿ㅋㅋ', 'ㄹㅇㅋㅋ',
        '이건좀 레전드네ㄷㄷ', '출첵', '감사', '여기까지 읽음',
        '재밌네ㅋㅋㅋ', '이건 ㄹㅇ',
    ],

    // 20% — 감정 표현
    emotional: [
        '눈물남ㅠ', '눈물남ㅠㅠ', '진짜소름', '소름ㄷㄷ',
        '심장 아파', '미쳤음ㅋㅋ', '아 ㅈㄴ슬프네',
        '이 장면 진짜...', '💔',
        '아 개웃기네ㅋㅋㅋ', '심장 터질 것 같아', '숨 못 쉬겠어',
        '아 진짜 화나', '개감동ㅠㅠ', '설렌다', '두근두근',
        '아 미치겠네', '진짜 답답해', '이건 못참지', '개쩐다',
        '밑고있었다고 젠장!',
        '작가님이 이기셨습니다 / 저는 ㅈㅈ치겠습니다',
        '와 이건 진짜', '아 개웃겨ㅋㅋㅋㅋㅋ', '심장 뛰어',
        '진심 소름돋음', '미쳤음ㅋㅋ', '헉', '와...', '대박',
    ],

    // 10% — 분석/이론/떡밥
    theorist: [
        '아마 그건 복선인듯', '여기 떡밥 깔린 거 같은데',
        '다음화에 반전 올 듯', '이거 나중에 중요할 듯',
        '혹시 이거...?', '설마 저 캐릭이?', '복선 미쳤다',
        '여기서 복선 회수했네', '앞에 나온 거랑 연결되네',
        '이 설정 ㄹㅇ', '설정 말 되네', '이건 억지 아님',
        '아 그래서 그랬구나', '이제 이해됨', '오 복선 깔았네',
        '나중에 이거 중요할 듯', '이부분 기억해둬야겠다',
        '복선인가?', '떡밥 투척', '복선 회수 개쩔어',
        '설정 좋네', '이 설정 신선한데',
        '전개 예측불가', '이 전개 누가 예상함?',
    ],

    // 10% — 격려/응원
    cheerleader: [
        '작가님 화이팅!', '계속 올려주세요ㅠㅠ', '다음화 기대됩니다',
        '매일 올려주세요🙏', '존버 시작',
        '작가님 사랑해요', '응원합니다', '화이팅',
        '계속 연재해주세요', '작가님 최고', '감사합니다',
        '매일 기다릴게요', '다음화 존버', '빨리 주세요ㅠ',
        '아 다음화 언제 나와요??', '업뎃 기다립니다',
        '작가님 건강 챙기세요', '무리하지 마세요',
        '정주행 시작', '정주행 중', '재밌게 읽었어요', '굿굿',
        '이거 믿고 정주행 하고 있는데 정말 재밌네요',
        '우선 글빨 좋아서 감정선 씹상타치라 계속 보는데',
        '정말 1부 초반 개꿀잼이야 진짜ㅜㅜ',
        '1부는 진짜 레전설이었음',
        '사랑해요 작가님',
        '안 오십니까? 작가님~ 얼른 오세요',
    ],

    // 5% — 비판/불만
    critic: [
        '기어이 한달을 통으로 쉬네', '2월이다 대체 언제?',
        '연재 안하니까 보지마셈', '글안쓰나...',
        '비속어가 읽기힘들정도로 많네',
        '쌍욕이 너무 나오는 느낌인데ㅋㅋ 뭔가 내가 욕먹는느낌이라...',
        '언제와', '튀어나오라고',
        // 겜바바 수집
        '앤 쌍욕이 너무 나오는 느낌', '근데 쌍욕이 좀...',
        '아니 이보쇼 작가양반',
    ],
};

// ============================================================
// Context-required 템플릿 — {name1}, {name2} 치환 필요 (수집 데이터 70+개)
// ============================================================
const CONTEXT_TEMPLATES: { template: string; tone: PersonalityTone }[] = [
    // ========== emotional (25개) ==========
    { template: '{name1} 죽은 줄 알고 다 포기하고 {name2}이랑 결혼하지마..', tone: 'emotional' },
    { template: '은근히 고집있는 {name1} 귀여워', tone: 'emotional' },
    { template: '자다가도 {name1}이 다른 여자 얘기하니까 바로 깨는 {name2}', tone: 'emotional' },
    { template: '{name1}로 단련된 내 멘탈은 {name1}와 같다', tone: 'emotional' },
    { template: '도대체 {name1}얘기는 들을때마다 두려워서 건들지도 못한다...', tone: 'emotional' },
    { template: '개약한 {name1} 믿을 수 없다 아아아아악', tone: 'emotional' },
    { template: '{name1} 때문에 울었다 진짜', tone: 'emotional' },
    { template: '{name1}이 불쌍해서 못보겠어', tone: 'emotional' },
    { template: '{name1} 고백장면에서 심장터짐', tone: 'emotional' },
    { template: '{name1}이랑 {name2} 이별하면 나 진짜 접는다', tone: 'emotional' },
    { template: '{name1} 살려줘ㅠㅠㅠ 제발', tone: 'emotional' },
    { template: '아 {name1} 죽으면 어떡해', tone: 'emotional' },
    { template: '{name1} 행동 보면 진짜 답없다ㅋㅋ 근데 멋있어', tone: 'emotional' },
    { template: '{name1}한테 감정이입 미쳤다', tone: 'emotional' },
    { template: '{name1} 나올때마다 가슴이 아프다', tone: 'emotional' },
    { template: '{name1} 지켜주고싶어ㅠ', tone: 'emotional' },
    { template: '{name1} 퇴장하면 안돼...', tone: 'emotional' },
    { template: '{name1} {name2} 그냥 행복하게 해줘라', tone: 'emotional' },
    { template: '{name1} 고통받는거 더 못보겠다', tone: 'emotional' },
    { template: '{name1} 각성할때 소름', tone: 'emotional' },
    { template: '{name1} 진심 갓인데 왜 아무도 안알아봄', tone: 'emotional' },
    { template: '{name1}하고 {name2} 재회하는데 눈물남ㅠ', tone: 'emotional' },
    { template: '{name1} 혼자 버티는거 보니까 마음아프다', tone: 'emotional' },
    { template: '{name1} 웃는장면 처음인데 개좋아ㅠㅠ', tone: 'emotional' },
    { template: '{name1} 마지막말에 울컥했다', tone: 'emotional' },

    // ========== short_reactor (25개) ==========
    { template: '그리고 {name1}는 귀여웠다', tone: 'short_reactor' },
    { template: '{name1} ㄹㅇ 걸쭉하다', tone: 'short_reactor' },
    { template: '{name1}랑 {name2}이 너무 쎈데', tone: 'short_reactor' },
    { template: '{name1}아...!', tone: 'short_reactor' },
    { template: '이자식 {name1}이었네', tone: 'short_reactor' },
    { template: '너도 나도 {name1}은 날 사랑한다 선언ㅋㅋㅋㅋ', tone: 'short_reactor' },
    { template: '{name1} 개웃기네ㅋㅋㅋ', tone: 'short_reactor' },
    { template: '{name1} 진짜 미쳤음ㅋㅋ', tone: 'short_reactor' },
    { template: '{name1} 등장할때마다 긴장됨', tone: 'short_reactor' },
    { template: '{name1} 왜 이렇게 매력있냐', tone: 'short_reactor' },
    { template: '{name1} ㅋㅋㅋㅋ 뭐하는거야', tone: 'short_reactor' },
    { template: '{name1} 찐이다', tone: 'short_reactor' },
    { template: '{name1}이 {name2} 때리는장면 시원하네', tone: 'short_reactor' },
    { template: '{name1} 드디어 나왔다', tone: 'short_reactor' },
    { template: '{name1} 이번화 존재감 미쳤는데', tone: 'short_reactor' },
    { template: '{name1} 한마디에 분위기 다 잡네', tone: 'short_reactor' },
    { template: '{name1} 말투 왜이래ㅋㅋ', tone: 'short_reactor' },
    { template: '{name1}이 {name2} 구하러갈듯', tone: 'short_reactor' },
    { template: '{name1} 쌍욕하는장면 ㅋㅋㅋ', tone: 'short_reactor' },
    { template: '{name1} 존잘인거 확정', tone: 'short_reactor' },
    { template: '{name1} 빠질수밖에 없다 진짜', tone: 'short_reactor' },
    { template: '아 {name1} 짜증나ㅋㅋㅋㅋ', tone: 'short_reactor' },
    { template: '{name1} 여기서 왜나옴', tone: 'short_reactor' },
    { template: '{name1}이랑 {name2} 케미 미쳤다', tone: 'short_reactor' },
    { template: '{name1} 먹방ㅋㅋㅋ진짜', tone: 'short_reactor' },

    // ========== theorist (15개) ==========
    { template: '스승님 기억도 안나네 {name1}가 정실이다ㅇㅇ', tone: 'theorist' },
    { template: '역시 고인물의 재능이 느껴지는 {name1}...!', tone: 'theorist' },
    { template: '{name1} 나중에 배신할 것 같은데', tone: 'theorist' },
    { template: '{name1}이 진짜 최종보스 아님?', tone: 'theorist' },
    { template: '{name1} 정체 아직 안 밝혀졌잖아', tone: 'theorist' },
    { template: '{name1} 능력 각성 아직 안끝난듯', tone: 'theorist' },
    { template: '{name1}이 {name2} 아버지인 떡밥 있는거 같은데', tone: 'theorist' },
    { template: '{name1} 지금 숨기는거 있음 확실해', tone: 'theorist' },
    { template: '{name1} 과거편 나올듯', tone: 'theorist' },
    { template: '{name1} 사실 처음부터 편이었던거 아님?', tone: 'theorist' },
    { template: '{name1}이 {name2} 스킬 카피한거 같은데', tone: 'theorist' },
    { template: '{name1} 아이템 나중에 쓸거같음', tone: 'theorist' },
    { template: '아무래도 {name1}이 흑막인듯', tone: 'theorist' },
    { template: '{name1} 레벨 지금 어디쯤인거야', tone: 'theorist' },
    { template: '{name1}이랑 {name2} 같은 혈통 아님?', tone: 'theorist' },

    // ========== cheerleader (8개) ==========
    { template: '{name1} 사랑해ㅠㅠ', tone: 'cheerleader' },
    { template: '{name1} 행복해줘...', tone: 'cheerleader' },
    { template: '{name1} 보려고 정주행하는중', tone: 'cheerleader' },
    { template: '{name1} 나올때마다 기분좋아짐', tone: 'cheerleader' },
    { template: '{name1} 최애다 진짜', tone: 'cheerleader' },
    { template: '{author}님 {name1} 많이 나오게 해주세요', tone: 'cheerleader' },
    { template: '{name1} 스핀오프 내줘요 제발', tone: 'cheerleader' },
    { template: '{name1} 엔딩 해피엔딩이어야함', tone: 'cheerleader' },

    // ========== critic (4개) ==========
    { template: '{name1} 요즘 너무 비중없다', tone: 'critic' },
    { template: '{name1} 캐릭터 붕괴 아님?', tone: 'critic' },
    { template: '{name1}이 이렇게 약해지면 안되는데', tone: 'critic' },
    { template: '{name1}이랑 {name2} 전개 너무 억지', tone: 'critic' },
];

// ============================================================
// 장르별 템플릿 — 장르에만 어울리는 고유 댓글
// ============================================================
const GENRE_TEMPLATES: Record<string, string[]> = {
    // 일반 판타지
    fantasy: [
        '마나 폭주하는 장면 소름', '각성 장면 연출 미쳤음',
        '드디어 강해짐ㅋㅋ', '이 스킬 사기인데',
        '주인공 성장속도 미쳤네', '여기서 각성하네',
        '마법 체계 좋네', '이세계 설정 신선하네',
        '결계 뚫리는 장면 긴장감', '아티팩트 개사기네',
        '파워업 개간지', '진짜 강해졌네ㅋㅋ',
    ],
    // 게임 판타지
    game_fantasy: [
        '이 빌드 ㄹㅇ 사기인데', '스탯 배분 잘못한거 아님?',
        '밸런스 패치 먹을듯', '이 스킬트리 미쳤네',
        '아이템 드랍률 개쩌는데', '이 던전 공략법 다른데?',
        '레이드 혼자 간다고?ㅋㅋ', '보스 패턴 개빡세네',
        '인벤토리 정리 좀 해라ㅋㅋ', '파티 모집 실화냐',
        '퀘스트 보상 ㅈㄴ 후한데', '이 직업 상향 먹었네',
        '숨겨진 퀘스트 있을듯', '랭커 되겠네 이러면',
        'PK당하면 어쩌려고', '시스템 창 뜨는거 좋다ㅋㅋ',
    ],
    // 로맨스 판타지
    romance_fantasy: [
        '둘이 키스할줄', '설렘 폭발ㅠ', '이거 썸인거지?',
        '심쿵사 당했음', '고백해라 제발',
        '둘이 눈 마주치는데 심장', '커플링 확정이지 이거',
        '남주 왜이렇게 설레게 하냐', '여주 당당한거 개좋아',
        '전생 기억 돌아올때 소름',
        '사교계 정치 재밌다',
        '작가님 너무너무너무너무너무 맛있어요',
    ],
    // 무협
    martial_arts: [
        '내공 폭발하는 장면 개간지', '검기 묘사 미쳤음',
        '무림맹 설정 좋다',
        '경공 장면 개쩔어', '독공 위험하지 않나ㅋㅋ',
        '혈도 짚는 장면 소름', '비급 습득하는거 개좋네',
        '천하제일대회 기대됨',
        '협객다운 한마디 소름', '무공 이름 개간지',
        '절초 펼치는 장면 미쳤음', '강호 세계관 좋네',
    ],
};
// ============================================================
// 장르별 personalityTone 분포
// ============================================================
const GENRE_WEIGHTS: Record<string, { tone: PersonalityTone; weight: number }[]> = {
    default: [
        { tone: 'short_reactor', weight: 55 },
        { tone: 'emotional', weight: 20 },
        { tone: 'theorist', weight: 10 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    game_fantasy: [
        { tone: 'theorist', weight: 40 },
        { tone: 'short_reactor', weight: 25 },
        { tone: 'cheerleader', weight: 20 },
        { tone: 'emotional', weight: 5 },
        { tone: 'critic', weight: 10 },
    ],
    romance_fantasy: [
        { tone: 'cheerleader', weight: 40 },
        { tone: 'emotional', weight: 25 },
        { tone: 'short_reactor', weight: 25 },
        { tone: 'theorist', weight: 5 },
        { tone: 'critic', weight: 5 },
    ],
    martial_arts: [
        { tone: 'short_reactor', weight: 50 },
        { tone: 'cheerleader', weight: 20 },
        { tone: 'theorist', weight: 15 },
        { tone: 'critic', weight: 10 },
        { tone: 'emotional', weight: 5 },
    ],
};

let PERSONALITY_WEIGHTS: { tone: PersonalityTone; weight: number }[] = [
    { tone: 'short_reactor', weight: 55 },
    { tone: 'emotional', weight: 20 },
    { tone: 'theorist', weight: 10 },
    { tone: 'cheerleader', weight: 10 },
    { tone: 'critic', weight: 5 },
];

// 댓글 개수 가중치 (봇당)
const COMMENT_COUNT_WEIGHTS = [
    { count: 0, weight: 20 },
    { count: 1, weight: 40 },
    { count: 2, weight: 30 },
    { count: 3, weight: 10 },
];

// ============================================================
// 유틸리티 함수
// ============================================================

function weightedRandom<T>(items: { item: T; weight: number }[]): T {
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
        if (random < item.weight) return item.item;
        random -= item.weight;
    }
    return items[items.length - 1].item;
}

function pickPersonalityTone(): PersonalityTone {
    return weightedRandom(
        PERSONALITY_WEIGHTS.map(pw => ({ item: pw.tone, weight: pw.weight }))
    );
}

function pickCommentCount(): number {
    return weightedRandom(
        COMMENT_COUNT_WEIGHTS.map(cw => ({ item: cw.count, weight: cw.weight }))
    );
}

function pickNickname(usedNicknames: Set<string>): string {
    // 수집 닉네임 풀에서 랜덤 (중복 방지)
    const available = NICKNAME_POOL.filter(n => !usedNicknames.has(n));
    if (available.length === 0) {
        // 풀 소진 시 suffix 추가
        const base = NICKNAME_POOL[Math.floor(Math.random() * NICKNAME_POOL.length)];
        const suffix = Math.floor(Math.random() * 999) + 1;
        const nn = `${base}_${suffix}`;
        usedNicknames.add(nn);
        return nn;
    }
    const selected = available[Math.floor(Math.random() * available.length)];
    usedNicknames.add(selected);
    return selected;
}

// ============================================================
// 규칙 7-9: 동적 변형 (롱테일 분포 + GPT 피드백)
// ============================================================
function applyDynamicVariations(text: string): string {
    let result = text;

    // 규칙 7: ㅋㅋ 롱테일 분포
    if (result.includes('ㅋㅋ')) {
        const rand = Math.random();
        let count: number;
        if (rand < 0.40) count = 2 + Math.floor(Math.random() * 2);       // 2-3개 (40%)
        else if (rand < 0.80) count = 4 + Math.floor(Math.random() * 3);  // 4-6개 (40%)
        else if (rand < 0.95) count = 7 + Math.floor(Math.random() * 6);  // 7-12개 (15%)
        else count = 20 + Math.floor(Math.random() * 11);                  // 20-30개 (5% 광기)

        result = result.replace(/ㅋㅋ+/g, 'ㅋ'.repeat(count));

        // 말줄임표 10%
        if (Math.random() < 0.10) result = result.replace(/(ㅋ+)$/, '$1...');
    }

    // 규칙 8: 이모지 2% (디시+노벨피아 톤이면 극소량)
    if (Math.random() < 0.02) {
        const emojis = ['👍', '🔥'];
        result += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
    }

    // 규칙 9: 물음표 강조
    if (result.includes('?') && Math.random() < 0.30) {
        const count = Math.floor(Math.random() * 8) + 2;
        result = result.replace(/\?+/g, '?'.repeat(count));
    }

    return result;
}

// ============================================================
// 후처리 왜곡 파이프라인 (GPT 피드백 핵심!)
// ============================================================
function humanize(comment: string): string {
    let result = comment;

    // 사자성어 필터 (포함된 댓글은 폐기)
    const idiomBlacklist = [
        '일석이조', '새옹지마', '천생연분', '화룡점정', '역지사지',
        '오매불망', '절치부심', '호연지기', '동병상련', '금상첨화',
        '전화위복', '사필귀정', '아전인수', '자업자득', '이심전심',
        '동문서답', '우이독경', '이구동성', '백발백중', '타산지석',
    ];

    for (const idiom of idiomBlacklist) {
        if (result.includes(idiom)) {
            return '';  // 사자성어 포함 시 댓글 폐기
        }
    }

    // 20% 마침표 삭제
    if (Math.random() < 0.20) {
        result = result.replace(/\.$/, '');
    }

    // 10% ㅋㅋ 추가 (뒤에)
    if (Math.random() < 0.10 && !result.includes('ㅋ')) {
        const count = Math.floor(Math.random() * 4) + 2;
        result += 'ㅋ'.repeat(count);
    }

    // 10% ㅠㅠ 추가
    if (Math.random() < 0.10 && !result.includes('ㅠ')) {
        result += 'ㅠㅠ';
    }

    // 3% 현실적 오타 패턴 (ㅋ↔ㅎ 전환, 자음 탈락)
    if (Math.random() < 0.03 && result.length > 3) {
        const typoPatterns = [
            [/ㅋㅋ$/, 'ㅎㅎ'],           // ㅋ→ㅎ 인접키
            [/ㅠㅠ$/, 'ㅜㅜ'],           // ㅠ→ㅜ 인접키
            [/ㅋㅋㅋ/, 'ㅋㅋ'],          // 자음 탈락
            [/\.\.\./, '..'],           // 말줄임 줄임
        ] as [RegExp, string][];
        const pattern = typoPatterns[Math.floor(Math.random() * typoPatterns.length)];
        result = result.replace(pattern[0], pattern[1]);
    }

    return result;
}

// ============================================================
// 템플릿 선택 (규칙 11: 재사용 간격)
// ============================================================
function pickComment(
    tone: PersonalityTone,
    usedTemplates: Set<string>,
    characterNames: string[],
    genreKey: string = ''
): string {
    // 25% 확률로 장르별 템플릿 시도 (장르 있을 때만)
    if (genreKey && Math.random() < 0.25) {
        const genrePool = GENRE_TEMPLATES[genreKey];
        if (genrePool && genrePool.length > 0) {
            const available = genrePool.filter((t: string) => !usedTemplates.has(t));
            let selected: string;
            if (available.length === 0) {
                selected = genrePool[Math.floor(Math.random() * genrePool.length)];
            } else {
                selected = available[Math.floor(Math.random() * available.length)];
            }
            usedTemplates.add(selected);
            selected = applyDynamicVariations(selected);
            selected = humanize(selected);
            return selected;
        }
    }

    // 15% 확률로 context-required 템플릿 시도 (캐릭터 이름 있을 때만)
    if (characterNames.length > 0 && Math.random() < 0.15) {
        const contextPool = CONTEXT_TEMPLATES.filter(t => t.tone === tone);
        if (contextPool.length > 0) {
            const ct = contextPool[Math.floor(Math.random() * contextPool.length)];
            let text = ct.template;
            // {name1}, {name2} 치환
            const shuffled = [...characterNames].sort(() => Math.random() - 0.5);
            text = text.replace(/\{name1\}/g, shuffled[0] || '주인공');
            text = text.replace(/\{name2\}/g, shuffled[1] || shuffled[0] || '주인공');
            text = text.replace(/\{author\}/g, '작가');
            text = applyDynamicVariations(text);
            text = humanize(text);
            usedTemplates.add(ct.template); // context도 재사용 방지
            return text;
        }
    }

    // Universal 템플릿
    const pool = TEMPLATES[tone];
    const available = pool.filter(t => !usedTemplates.has(t));

    let selected: string;
    if (available.length === 0) {
        usedTemplates.clear();
        selected = pool[Math.floor(Math.random() * pool.length)];
    } else {
        selected = available[Math.floor(Math.random() * available.length)];
    }
    usedTemplates.add(selected);

    // 규칙 7-9: 동적 변형
    selected = applyDynamicVariations(selected);

    // 후처리 왜곡
    selected = humanize(selected);

    return selected;
}

// ============================================================
// 규칙 6번: 시간 분산 — 최근 24시간 60% (GPT 피드백)
// ============================================================
function randomTimestamp(episodeCreatedAt?: Date): Date {
    const now = Date.now();
    const earliest = episodeCreatedAt ? episodeCreatedAt.getTime() : now - 7 * 24 * 60 * 60 * 1000;
    const range = now - earliest;

    if (range <= 0) return new Date(now);

    const rand = Math.random();
    let offset: number;

    if (rand < 0.60) {
        // 60% 최근 24시간 (범위 내)
        offset = Math.random() * Math.min(24 * 60 * 60 * 1000, range);
    } else if (rand < 0.85) {
        // 25% 1-3일 (범위 내)
        offset = Math.random() * Math.min(3 * 24 * 60 * 60 * 1000, range);
    } else {
        // 15% 3-7일 (범위 내)
        offset = Math.random() * Math.min(7 * 24 * 60 * 60 * 1000, range);
    }

    const result = new Date(now - offset);
    // 에피소드 업로드일보다 이전이면 보정
    if (episodeCreatedAt && result.getTime() < earliest) {
        return new Date(earliest + Math.random() * range);
    }
    return result;
}

// ============================================================
// ============================================================
// Review Model — OpenAI 직접 API (GPT-5 시리즈 검수용)
// ============================================================
async function callOpenAIReview(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_REVIEW_API_KEY;
    const model = process.env.OPENAI_REVIEW_MODEL || 'o3-mini';

    if (!apiKey) {
        console.warn('⚠️ OpenAI Review API key not configured, skipping review');
        return '';
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 800,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`❌ OpenAI Review error: ${response.status} — ${errorBody.substring(0, 200)}`);
            return '';
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        console.log(`✅ OpenAI Review response: ${content.substring(0, 100)}...`);
        return content;
    } catch (err) {
        console.error('❌ OpenAI Review call failed:', err);
        return '';
    }
}

// ============================================================
// Deep Context GPT — Azure OpenAI 호출
// ============================================================
async function callAzureGPT(prompt: string): Promise<string> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview';
    const deployment = 'gpt-4omini';

    console.log(`🔍 Azure config check: endpoint=${endpoint ? 'SET(' + endpoint.substring(0, 30) + '...)' : 'MISSING'}, apiKey=${apiKey ? 'SET' : 'MISSING'}`);

    if (!endpoint || !apiKey) {
        console.warn('⚠️ Azure OpenAI not configured, skipping deep context');
        return '';
    }

    try {
        let url: string;

        // endpoint가 이미 /deployments/ 포함하면 그대로 사용 (full URL)
        if (endpoint.includes('/deployments/')) {
            url = endpoint;
            console.log(`🔗 Azure GPT URL (full): ${url}`);
        } else {
            // base URL만 있으면 경로 구성
            const baseUrl = endpoint.replace(/\/openai\/v1\/?$/, '').replace(/\/$/, '');
            url = `${baseUrl}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
            console.log(`🔗 Azure GPT URL (constructed): ${url}`);
        }

        console.log(`📨 Prompt length: ${prompt.length} chars`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 1200,
            }),
        });

        console.log(`📥 Azure response status: ${response.status}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`❌ Azure GPT error: ${response.status} — ${errorBody.substring(0, 200)}`);
            return '';
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        console.log(`✅ Azure GPT response: ${content.substring(0, 100)}...`);
        return content;
    } catch (err) {
        console.error('❌ Azure GPT call failed:', err);
        return '';
    }
}

// ============================================================
// 집단 독자 행동 시뮬레이터 v1
// Stage 1: Event Extraction → Stage 2: Reader Profiles →
// Stage 3: Info Restriction → Stage 4: Comment Gen →
// Stage 5: GPT-5 Curator → Stage 6: Noise
// ============================================================

interface StoryEvent {
    id: number;
    summary: string;
    type: string;
    importance: number;
    characters: string[];
    quote?: string;
    detail?: string;  // 구체적 묘사/감정 (딜컨텍스트용)
}

interface EventExtraction {
    events: StoryEvent[];
    dominantEmotion: string;
}

type ReaderType = 'immersed' | 'skimmer' | 'overreactor' | 'analyst' | 'troll' | 'misreader' | 'lurker';

interface ReaderProfile {
    type: ReaderType;
    personaId: string;    // 30-persona ID (e.g. 'A1')
    personaTone: string;  // 말투 설명
    personaStyle: string; // 행동 패턴
    personaEndings: string[]; // 어미 조각
    personaCognitive: string; // 사고 초점 — 이 독자가 집착하는 대상
    attentionSpan: number;
    memoryNoise: number;
    emotionalIntensity: number;
    literacy: number;
    sarcasmLevel: number;
    bandwagonTarget?: string;
    dominantEmotion?: string;
}

// ============================================================
// 30 페르소나 풀 — 장르별 배치 시스템
// ============================================================
interface PersonaDef {
    id: string;
    name: string;
    baseType: ReaderType;
    callGroup: 'immersed' | 'overreactor' | 'chaos' | 'casual';
    tone: string;           // 말투 규칙
    style: string;          // 행동 패턴 (완성 문장 아님)
    endings: string[];      // 어미/조각 (조합용)
    cognitiveFocus: string; // 사고 초점 — 이 독자가 집착하는 대상
}

const PERSONA_POOL: PersonaDef[] = [
    // === A. 몰입형 (8개) ===
    {
        id: 'A1', name: '감정이입러', baseType: 'immersed', callGroup: 'immersed',
        tone: '~미쳤다, ~좋음으로 끊음. ㅋㅋ와 ㅠㅠ 섞어 씀. 감정 표현 직설적',
        style: '특정 장면에서 캐릭터 감정에 빙의. 직설적',
        endings: ['~미쳤다', '~좋음', '~좋다', '~진짜'],
        cognitiveFocus: '캐릭터의 표정, 대사, 행동 하나에 꽂혀서 거기만 본다'
    },
    {
        id: 'A2', name: '분위기충', baseType: 'immersed', callGroup: 'immersed',
        tone: '~미쳤다, ~좋음으로 끊음. ㅋㅋ와 ㅠㅠ 섞어 씀. 감정 표현 직설적',
        style: '분위기/공간감/단어 선택에 반응. 비주얼 감탄',
        endings: ['~미쳤다', '~좋음', '~좋다', '~진짜'],
        cognitiveFocus: '장면의 분위기, 공간, 날씨, 색감, 연출에 집착한다'
    },
    {
        id: 'A3', name: '커플러', baseType: 'immersed', callGroup: 'immersed',
        tone: '~ㅠㅠ, ~제발로 끊음. 감정 강도 높음. 캐릭터 이름 직접 언급',
        style: '관계/긴장감/고백에 반응. 캐릭터 이름 직접 사용',
        endings: ['~ㅠㅠ', '~제발', '~언제', '~사귀어'],
        cognitiveFocus: '두 캐릭터 사이의 거리감, 눈빛, 대화 뉘앙스에 집착한다'
    },
    {
        id: 'A4', name: '전투몰입러', baseType: 'immersed', callGroup: 'immersed',
        tone: '~ㅋㅋ, ~미쳤다로 끊음. ㅠㅠ 거의 안 씀. 감탄+약한 비속어',
        style: '전투/각성/체급차에 감탄. 쾌감 위주',
        endings: ['~미쳤다', '~개간지', '~ㅁㅊ', '~ㅋㅋ'],
        cognitiveFocus: '전투 동작, 스킬 묘사, 체급 차이, 역전 순간에 꽂힌다'
    },
    {
        id: 'A5', name: '서사충', baseType: 'immersed', callGroup: 'immersed',
        tone: '~구나, ~거임으로 끊음. 차분한 관찰체. 과장 없음',
        style: '성장/서사 흐름 관찰. 차분하게 정리',
        endings: ['~구나', '~거임', '~좋다', '~가는'],
        cognitiveFocus: '캐릭터의 성장 궤적, 이전과 달라진 점, 서사의 흐름에 집착한다'
    },
    {
        id: 'A6', name: '공포체험러', baseType: 'overreactor', callGroup: 'overreactor',
        tone: '~ㅅㅂ, ~진짜로 끊음. 짧은 공포 반응. ㅋㅋ는 자기방어용',
        style: '공포에 직접 반응. 읽으면서 무서워함',
        endings: ['~ㅅㅂ', '~진짜', '~소름', '~ㅋㅋ'],
        cognitiveFocus: '무서운 장면, 불안한 분위기, 뒤에 뭐가 있을 것 같은 느낌에 반응한다'
    },
    {
        id: 'A7', name: '감동충', baseType: 'overreactor', callGroup: 'overreactor',
        tone: 'ㅠㅠ 도배 허용. 과장 감정 OK. 와/아 감탄사 많음',
        style: '감동/슬픔에 과잉 반응. 눈물/심장 언급',
        endings: ['~ㅠㅠ', '~뜯김', '~남', '~제발'],
        cognitiveFocus: '캐릭터가 힘들어하거나 성장하는 구체적 순간에 감정이 터진다'
    },
    {
        id: 'A8', name: '시대감성러', baseType: 'immersed', callGroup: 'immersed',
        tone: '~좋다, ~안타깝다로 끊음. 차분한 감탄체. 과장 적음',
        style: '시대 분위기/운명에 감탄. 차분한 감상',
        endings: ['~좋다', '~안타깝다', '~몰입됐음', '~그렇구나'],
        cognitiveFocus: '시대적 배경, 운명의 무게, 인물이 처한 상황의 비극성에 집착한다'
    },

    // === B. 분석형 (7개) ===
    {
        id: 'B1', name: '복선추적러', baseType: 'analyst', callGroup: 'immersed',
        tone: '~임, ~100%로 끊음. 확신형 단정체. 근거 안 씀',
        style: '복선/떡밥/연결점 단정. 근거 없이 확신',
        endings: ['~임', '~100%', '~연결됨', '~회수'],
        cognitiveFocus: '이전 화 장면, 숨겨진 떡밥, 구조적 반복에 집착한다'
    },
    {
        id: 'B2', name: '세계관분석충', baseType: 'analyst', callGroup: 'immersed',
        tone: '~맞음, ~인데로 끊음. 설명 없이 당연히 아는 것처럼',
        style: '세계관/설정 정합성 판단. 아는 척',
        endings: ['~맞음', '~인데', '~충돌', '~회수 각'],
        cognitiveFocus: '세계관 규칙, 마법/물리 체계, 이전 설정과의 정합성에 집착한다'
    },
    {
        id: 'B3', name: '추리광', baseType: 'analyst', callGroup: 'immersed',
        tone: '~임, ~밖에 없음으로 끊음. 틀려도 확신',
        style: '범인/진범/시간선 추리. 틀려도 확신',
        endings: ['~임', '~밖에 없음', '~안 맞음', '~의심'],
        cognitiveFocus: '인물 동기, 시간선 앞뒤, 누가 거짓말하는지에 집착한다'
    },
    {
        id: 'B4', name: '설정감시자', baseType: 'analyst', callGroup: 'immersed',
        tone: '~맞음, ~무리인데로 끊음. 냉정 단정체. 감탄 거의 없음',
        style: '설정 구멍/물리적 모순 지적. 냉정',
        endings: ['~맞음', '~무리인데', '~구멍임', '~좀'],
        cognitiveFocus: '장면 속 물리/마법 규칙이 말이 되는지 따진다'
    },
    {
        id: 'B5', name: '고증충', baseType: 'analyst', callGroup: 'immersed',
        tone: '~맞음, ~했네로 끊음. 칭찬도 함. 약간 나이 든 느낌',
        style: '역사적 고증 평가. 칭찬/지적 섞음',
        endings: ['~맞음', '~했네', '~다른데', '~그렇지'],
        cognitiveFocus: '역사적 사실, 시대 고증, 문화적 디테일의 정확성에 집착한다'
    },
    {
        id: 'B6', name: '메타분석러', baseType: 'analyst', callGroup: 'immersed',
        tone: '~일부러, ~인듯으로 끊음. 작가 직접 언급. 관찰자 시점',
        style: '작가 의도/연출 구조 분석. 관찰자 시점',
        endings: ['~일부러', '~인듯', '~의도적', '~대비'],
        cognitiveFocus: '작가의 연출 의도, 장면 배치 순서, 구조적 대비에 집착한다'
    },
    {
        id: 'B7', name: '회귀규칙충', baseType: 'analyst', callGroup: 'immersed',
        tone: '~갈림, ~올듯으로 끊음. 전생/현생 비교',
        style: '회귀/전생 규칙 비교. 나비효과 추측',
        endings: ['~갈림', '~올듯', '~안 되는데', '~달라짐'],
        cognitiveFocus: '전생과 현생의 차이, 나비효과, 회귀 규칙의 변화에 집착한다'
    },

    // === C. 반응형 (5개) ===
    {
        id: 'C1', name: '감정폭발러', baseType: 'overreactor', callGroup: 'overreactor',
        tone: 'ㅋ 또는 ㅠ 반복. 대문자/초성 혼합. 문장 구조 파괴',
        style: '감정 폭발로 문장 구조 파괴. 초성/반복',
        endings: ['ㅋㅋㅋㅋ', 'ㅠㅠㅠ', '~진짜', '~뭐하냐'],
        cognitiveFocus: '가장 자극적인 장면 하나에 감정이 폭발한다'
    },
    {
        id: 'C2', name: '사이다중독자', baseType: 'overreactor', callGroup: 'overreactor',
        tone: '~ㅅㅂ, ~ㅋㅋ로 끊음. 쾌감 표현 특화',
        style: '통쾌함/시원함에 반응. 응징/역전 쾌감',
        endings: ['~ㅅㅂ', '~ㅋㅋ', '~시원', '~개꿀'],
        cognitiveFocus: '악역이 당하는 장면, 역전, 통쾌한 순간에 꽂힌다'
    },
    {
        id: 'C3', name: '웃음폭발러', baseType: 'overreactor', callGroup: 'overreactor',
        tone: 'ㅋ 도배 최소 5개. ~미쳤냐, ~아프다로 끊음',
        style: '웃김에 반응. ㅋ 도배+신체 반응 언급',
        endings: ['ㅋㅋㅋㅋㅋ', '~미쳤냐', '~아프다', '~못 쉬겠음'],
        cognitiveFocus: '웃긴 대사, 캐릭터 행동, 상황의 아이러니에 꽂힌다'
    },
    {
        id: 'C4', name: '공감충', baseType: 'immersed', callGroup: 'immersed',
        tone: '~임, ~됨으로 끊음. 짧은 공감형. 나 언급',
        style: '자기 경험과 연결. "나"/"내" 자주 사용',
        endings: ['~임', '~됨', '~나', '~찐'],
        cognitiveFocus: '캐릭터 상황을 자기 경험과 연결한다'
    },
    {
        id: 'C5', name: '단어투척러', baseType: 'lurker', callGroup: 'casual',
        tone: '1~3단어만. 종결어미 없음. 마침표 없음',
        style: '단어 1~3개만 던짐. 문장 구성 안 함',
        endings: ['(종결어미 없음)', '(마침표 없음)', '(1~3단어)'],
        cognitiveFocus: '가장 인상적인 단어 하나만 뽑아서 던진다'
    },

    // === D. 냉소형 (5개) ===
    {
        id: 'D1', name: '전개비꼼러', baseType: 'troll', callGroup: 'chaos',
        tone: '~이네;, ~느림으로 끊음. 세미콜론 자주. 하.. 한탄',
        style: '전개 속도/반복에 불만. 한탄+비꼼',
        endings: ['~이네;', '~느림', '하..', '~어쭌'],
        cognitiveFocus: '스토리 전개의 느린 부분, 반복되는 패턴, 늘어지는 구간에 집착한다'
    },
    {
        id: 'D2', name: '클리셰헌터', baseType: 'troll', callGroup: 'chaos',
        tone: '~이네;, ~봤는데로 끊음. 또/어디서 자주 사용',
        style: '클리셰/기시감 지적. "또" "어디서" 자주',
        endings: ['~이네;', '~봤는데', '또~', '~풀코스'],
        cognitiveFocus: '다른 작품에서 본 전개, 뻔한 패턴, 기시감 나는 장면에 집착한다'
    },
    {
        id: 'D3', name: '파워밸런스충', baseType: 'troll', callGroup: 'chaos',
        tone: '~이네;, ~붕괴로 끊음. 게임 용어 사용',
        style: '파워밸런스/인플레 지적. 게임 용어 차용',
        endings: ['~이네;', '~붕괴', '~너프', '~인플레'],
        cognitiveFocus: '캐릭터 파워의 급격한 변화, 밸런스 붕괴, 설정 인플레에 집착한다'
    },
    {
        id: 'D4', name: '작가비판러', baseType: 'troll', callGroup: 'chaos',
        tone: '~이네, ~좀..으로 끊음. 직설+세미콜론. 약간 윗사람 느낌',
        style: '작가 구성력/전개에 직설적 비판',
        endings: ['~이네', '~좀..', '~과한 듯', '~이런 식'],
        cognitiveFocus: '작가의 구성력, 장면 전환, 대사 퀄리티에 불만을 느낀다'
    },
    {
        id: 'D5', name: '공포비꼼러', baseType: 'troll', callGroup: 'chaos',
        tone: '~이네;, ~진짜로 끊음. 왜 자주 사용',
        style: '공포 상황의 비합리성 비꼼',
        endings: ['~이네;', '~진짜', '왜~', '~죽는 거'],
        cognitiveFocus: '공포 상황에서 캐릭터의 비합리적 행동, 뻔한 공포 클리셰에 집착한다'
    },

    // === E. 밈/드립형 (5개) ===
    {
        id: 'E1', name: '게임드립러', baseType: 'lurker', callGroup: 'casual',
        tone: 'SSS급, 치트키 등 게임 용어+ㅋㅋ. 과장 비유',
        style: '상황을 게임 용어로 비유. 등급/스킬/치트',
        endings: ['~SSS급', '~치트', '~ㅋㅋ', '~뉴게임'],
        cognitiveFocus: '모든 상황을 게임 메커니즘으로 번역해서 본다'
    },
    {
        id: 'E2', name: '밈장인', baseType: 'lurker', callGroup: 'casual',
        tone: '시뮬레이터/다큐 등 장르 비유. 밈체+과장',
        style: '상황을 다른 장르/밈으로 비유',
        endings: ['~시뮬레이터', '~다큐', '~ㅋㅋ', '~가지고 놈'],
        cognitiveFocus: '장면을 다른 장르, 밈, 인터넷 유행어로 비유한다'
    },
    {
        id: 'E3', name: '연애드립러', baseType: 'lurker', callGroup: 'casual',
        tone: '작가 직접 언급. 드립+ㅋㅋ',
        style: '연애를 드립으로 비유. 작가 직접 언급',
        endings: ['~시뮬레이터', '~솔로', '~과다 섭취', '~ㅋㅋ'],
        cognitiveFocus: '연애 요소를 현실/밈으로 비유해서 드립을 친다'
    },
    {
        id: 'E4', name: '역사드립러', baseType: 'lurker', callGroup: 'casual',
        tone: '시대극→현대 밈 비유. 드립+ㅋㅋ',
        style: '역사→현대 감각으로 비유',
        endings: ['~타고 싶다', '~재밌음', '~나올듯', '~ㅋㅋ'],
        cognitiveFocus: '역사적 장면을 현대 감각으로 번역해서 드립을 친다'
    },
    {
        id: 'E5', name: '오독러', baseType: 'misreader', callGroup: 'chaos',
        tone: '~을걸, ~인듯으로 끊음. 확신형 (틀린 채로)',
        style: '잘못 읽고 확신. 근거 없는 단정',
        endings: ['~을걸', '~인듯', '~이었음', '~의심'],
        cognitiveFocus: '잘못 이해한 정보를 기반으로 확신에 찬 해석을 한다'
    },
];

// 장르별 페르소나 풀 (이 중에서 랜덤 6~8명 선택)
const GENRE_PERSONA_MAP: Record<string, string[]> = {
    'fantasy': ['A1', 'A2', 'A4', 'A5', 'A7', 'B1', 'B2', 'B6', 'C1', 'C5', 'D1', 'D2', 'D3', 'E1', 'E2', 'E5'],
    'game-fantasy': ['A1', 'A4', 'A5', 'B1', 'B2', 'B6', 'C1', 'C2', 'C5', 'D1', 'D2', 'D3', 'E1', 'E2', 'E5'],
    'murim': ['A1', 'A4', 'A5', 'B1', 'B2', 'C1', 'C2', 'C5', 'D1', 'D3', 'E1', 'E2', 'E5'],
    'romance': ['A1', 'A3', 'A7', 'B1', 'B6', 'C1', 'C4', 'C5', 'D1', 'D2', 'D4', 'E2', 'E3', 'E5'],
    'scifi': ['A2', 'B1', 'B2', 'B4', 'B6', 'C1', 'C5', 'D1', 'D4', 'E2', 'E5'],
    'mystery': ['A1', 'B1', 'B3', 'B6', 'C5', 'D1', 'D4', 'E2', 'E5'],
    'horror': ['A1', 'A2', 'A6', 'C1', 'C5', 'D1', 'D5', 'E2', 'E5'],
    'historical': ['A2', 'A5', 'A8', 'B1', 'B5', 'B6', 'C5', 'D1', 'D4', 'E4', 'E5'],
    'slice-of-life': ['A1', 'A5', 'A7', 'C4', 'C5', 'D1', 'D4', 'E2', 'E5'],
    'action': ['A4', 'B1', 'C1', 'C2', 'C5', 'D1', 'D3', 'E1', 'E2', 'E5'],
    'comedy': ['A1', 'C1', 'C3', 'C5', 'D1', 'D4', 'E1', 'E2', 'E5'],
    'regression': ['A4', 'A5', 'B1', 'B7', 'C2', 'C5', 'D1', 'D2', 'D3', 'E1', 'E2', 'E5'],
};

// 장르별 페르소나 풀에서 8명 선택
function selectPersonasForGenre(genreWeights: Record<string, number>, count: number = 8): PersonaDef[] {
    const personaMap = new Map(PERSONA_POOL.map(p => [p.id, p]));
    const defaultPool = ['A1', 'A2', 'A5', 'B1', 'B6', 'C1', 'C5', 'D1', 'E2', 'E5'];

    const categories = Object.keys(genreWeights);

    // 가중치 없으면 기본 풀
    if (categories.length === 0) {
        const shuffled = [...defaultPool].sort(() => Math.random() - 0.5).slice(0, count);
        const result = shuffled.map(id => personaMap.get(id)).filter(Boolean) as PersonaDef[];
        console.log(`🎭 Genre "default": selected ${result.length} personas: [${result.map(p => p.id + ' ' + p.name).join(', ')}]`);
        return result;
    }

    // 장르별 슬롯 수 계산 (Largest Remainder Method)
    const rawSlots = categories.map(cat => ({
        cat,
        raw: genreWeights[cat] * count,
        floor: Math.floor(genreWeights[cat] * count),
        remainder: (genreWeights[cat] * count) % 1
    }));

    let allocated = rawSlots.reduce((sum, s) => sum + s.floor, 0);
    // 나머지가 큰 순서대로 1씩 추가 (합이 count가 될 때까지)
    const sorted = [...rawSlots].sort((a, b) => b.remainder - a.remainder);
    for (const slot of sorted) {
        if (allocated >= count) break;
        slot.floor += 1;
        allocated += 1;
    }

    const slotMap: Record<string, number> = {};
    for (const s of rawSlots) {
        slotMap[s.cat] = s.floor;
    }

    console.log(`📊 Slot distribution: ${Object.entries(slotMap).map(([k, v]) => `${k}=${v}`).join(', ')} (total=${count})`);

    // 각 장르 풀에서 슬롯 수만큼 랜덤 선택
    const selected: PersonaDef[] = [];
    const usedIds = new Set<string>();

    for (const [cat, slots] of Object.entries(slotMap)) {
        if (slots === 0) continue;
        const pool = GENRE_PERSONA_MAP[cat] || defaultPool;
        const available = pool.filter(id => !usedIds.has(id));
        const shuffled = [...available].sort(() => Math.random() - 0.5);

        for (let i = 0; i < Math.min(slots, shuffled.length); i++) {
            const p = personaMap.get(shuffled[i]);
            if (p) {
                selected.push(p);
                usedIds.add(shuffled[i]);
            }
        }
    }

    // 부족하면 기본 풀에서 보충
    if (selected.length < count) {
        const fallback = defaultPool.filter(id => !usedIds.has(id)).sort(() => Math.random() - 0.5);
        for (const id of fallback) {
            if (selected.length >= count) break;
            const p = personaMap.get(id);
            if (p) {
                selected.push(p);
                usedIds.add(id);
            }
        }
    }

    // chaos/casual 최소 1명씩 보장
    const hasChaos = selected.some(p => p.callGroup === 'chaos');
    const hasCasual = selected.some(p => p.callGroup === 'casual');

    if (!hasChaos && selected.length > 0) {
        // 마지막 슬롯을 chaos로 교체
        const chaosPersona = PERSONA_POOL.filter(p => p.callGroup === 'chaos' && !usedIds.has(p.id))
            .sort(() => Math.random() - 0.5)[0];
        if (chaosPersona) selected[selected.length - 1] = chaosPersona;
    }
    if (!hasCasual && selected.length > 1) {
        const casualPersona = PERSONA_POOL.filter(p => p.callGroup === 'casual' && !usedIds.has(p.id))
            .sort(() => Math.random() - 0.5)[0];
        if (casualPersona) selected[selected.length - 2] = casualPersona;
    }

    console.log(`🎭 Weighted selection: ${selected.length} personas: [${selected.map(p => p.id + ' ' + p.name).join(', ')}]`);
    return selected.slice(0, count);
}

// ========== Stage 1: Event Extractor + Dominant Emotion ==========
async function extractEvents(episodeContent: string): Promise<EventExtraction> {
    const trimmed = episodeContent.length > 3000
        ? episodeContent.slice(-3000)
        : episodeContent;

    const prompt = `이 에피소드에서 독자가 반응할 핵심 사건 5~7개를 추출하고,
이 에피소드의 지배적 감정 1개를 골라라.

[출력 — 반드시 JSON]
{
  "dominantEmotion": "긴장|슬픔|분노|웃김|소름|설렘|허탈|감동 중 1개",
  "events": [
    { "id": 1, "summary": "사건 요약 (30자 이내)", "type": "action|emotion|dialogue|twist|reveal", "importance": 0.0~1.0, "characters": ["이름"], "quote": "원문 핵심 문장/대사 (40자 이내)", "detail": "이 장면의 구체적 묘사나 감정 (50자 이내)" }
  ]
}

[에피소드]
${trimmed}`;

    const raw = await callAzureGPT(prompt);
    if (!raw) return { events: [], dominantEmotion: '' };

    try {
        const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const data = JSON.parse(cleaned);
        if (data.events && Array.isArray(data.events)) {
            const emotion = data.dominantEmotion || '';
            console.log(`📋 Events: ${data.events.length}, dominant emotion: "${emotion}"`);
            return { events: data.events, dominantEmotion: emotion };
        }
    } catch (e) {
        console.warn('⚠️ Event extraction parse failed');
    }
    return { events: [], dominantEmotion: '' };
}

// ========== Stage 2: Reader Profiles (페르소나 기반 + 감정 쏠림) ==========
function generateReaderProfiles(events: StoryEvent[], personas: PersonaDef[], dominantEmotion: string = ''): ReaderProfile[] {
    const count = personas.length;

    // 감정 강도 히스토그램
    const emotionSlots = [1.5, 3.5, 4.0, 5.5, 6.0, 7.5, 8.0, 9.5];
    while (emotionSlots.length < count) emotionSlots.push(Math.random() * 10);
    for (let i = emotionSlots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [emotionSlots[i], emotionSlots[j]] = [emotionSlots[j], emotionSlots[i]];
    }

    // 캐릭터 동조 파동
    const allCharacters = [...new Set(events.flatMap(e => e.characters))];
    const bandwagonChar = Math.random() < 0.2 && allCharacters.length > 0
        ? allCharacters[Math.floor(Math.random() * allCharacters.length)]
        : null;


    const profiles: ReaderProfile[] = [];
    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    for (let i = 0; i < personas.length; i++) {
        const persona = personas[i];
        const emotion = i < emotionSlots.length ? emotionSlots[i] / 10 : Math.random();

        const profile: ReaderProfile = {
            type: persona.baseType,
            personaId: persona.id,
            personaTone: persona.tone,
            personaStyle: persona.style,
            personaEndings: persona.endings,
            personaCognitive: persona.cognitiveFocus,
            attentionSpan: 0,
            memoryNoise: 0,
            emotionalIntensity: emotion,
            literacy: 0,
            sarcasmLevel: 0,
        };

        // baseType에 따른 수치 설정
        switch (persona.baseType) {
            case 'immersed':
                profile.attentionSpan = rand(0.8, 1.0);
                profile.memoryNoise = rand(0, 0.1);
                profile.literacy = rand(0.6, 1.0);
                break;
            case 'skimmer':
                profile.attentionSpan = rand(0.2, 0.4);
                profile.memoryNoise = rand(0.3, 0.5);
                profile.literacy = rand(0.3, 0.6);
                break;
            case 'overreactor':
                profile.attentionSpan = rand(0.5, 0.8);
                profile.memoryNoise = rand(0.1, 0.2);
                profile.emotionalIntensity = Math.max(profile.emotionalIntensity, 0.8);
                profile.literacy = rand(0.3, 0.5);
                break;
            case 'analyst':
                profile.attentionSpan = rand(0.9, 1.0);
                profile.memoryNoise = 0;
                profile.literacy = rand(0.7, 1.0);
                break;
            case 'troll':
                profile.attentionSpan = rand(0.3, 0.6);
                profile.memoryNoise = rand(0.3, 0.7);
                profile.sarcasmLevel = rand(0.6, 1.0);
                profile.literacy = rand(0.2, 0.5);
                break;
            case 'misreader':
                profile.attentionSpan = rand(0.4, 0.6);
                profile.memoryNoise = rand(0.5, 0.8);
                profile.literacy = rand(0.4, 0.7);
                break;
            case 'lurker':
                profile.attentionSpan = rand(0.1, 0.3);
                profile.memoryNoise = 0;
                profile.literacy = rand(0.1, 0.3);
                break;
        }

        // 캐릭터 동조
        if (bandwagonChar && Math.random() < 0.4) {
            profile.bandwagonTarget = bandwagonChar;
        }

        // Conservative intensity boost based on episode mood (not vocabulary)
        // Affects expression strength only, not word choice
        if (dominantEmotion) {
            const moodIntensityBoost: Record<string, number> = {
                '슬픔': 1.08, '소름': 1.06, '감동': 1.06,
                '긴장': 1.04, '분노': 1.05,
                '설렘': 1.0,  // No boost - this was causing romance overflow
                '웃김': 1.0, '허탈': 1.0
            };
            const boost = moodIntensityBoost[dominantEmotion] || 1.0;
            profile.emotionalIntensity *= boost;
        }

        profiles.push(profile);
    }

    if (bandwagonChar) {
        console.log(`👥 Bandwagon: ${profiles.filter(p => p.bandwagonTarget).length} readers on "${bandwagonChar}"`);
    }


    return profiles;
}


// ========== Stage 3: Info Restriction + 해석 왜곡 ==========
function buildReaderView(events: StoryEvent[], profile: ReaderProfile): string {
    // attentionSpan에 따라 볼 수 있는 사건 수 결정
    const visibleCount = Math.max(1, Math.round(events.length * profile.attentionSpan));

    let visibleEvents: StoryEvent[];
    if (profile.type === 'skimmer') {
        // 앞쪽 사건만 봄
        visibleEvents = events.slice(0, visibleCount);
    } else if (profile.type === 'overreactor') {
        // importance 높은 것만 봄
        visibleEvents = [...events].sort((a, b) => b.importance - a.importance).slice(0, visibleCount);
    } else {
        // 랜덤 선택
        const shuffled = [...events].sort(() => Math.random() - 0.5);
        visibleEvents = shuffled.slice(0, visibleCount);
    }

    // 이중 왜곡 (misreader 전용 — 텍스트 40% + 해석 60%)
    if (profile.type === 'misreader' && profile.memoryNoise > 0.3) {
        visibleEvents = visibleEvents.map(e => {
            if (Math.random() < profile.memoryNoise) {
                // 40% 텍스트 왜곡, 60% 해석 왜곡
                const useTextDistort = Math.random() < 0.4;
                return {
                    ...e,
                    summary: useTextDistort
                        ? distortEventText(e.summary)
                        : distortInterpretation(e.summary, e.characters),
                };
            }
            return e;
        });
    }

    // 프로파일별 포맷
    switch (profile.type) {
        case 'lurker':
            // 캐릭터 이름 + 키워드만
            return visibleEvents.map(e => e.characters.join('/') + ': ' + e.type).join(', ');

        case 'troll':
            // 캐릭터 이름 + 사건 요약만
            return visibleEvents.map(e => `${e.characters[0] || '누군가'} — ${e.summary}`).join('\n');

        case 'analyst':
            // 사건 전체 + quote + detail + 관계
            return visibleEvents.map(e =>
                `[${e.type}] ${e.summary} (${e.characters.join(', ')})${e.quote ? ` — "${e.quote}"` : ''}${e.detail ? ` [${e.detail}]` : ''}`
            ).join('\n');

        default:
            // 사건 요약 + quote + detail
            return visibleEvents.map(e =>
                `${e.summary}${e.quote ? ` — "${e.quote}"` : ''}${e.detail ? ` (${e.detail})` : ''}`
            ).join('\n');
    }
}

// 텍스트 왜곡 — 기억 혼동, 인과관계 뒤집힘
function distortEventText(summary: string): string {
    const transforms = [
        (s: string) => s.replace(/(했|함|됨|임)$/, '한 건가?'),
        (s: string) => s + '인 줄 알았는데',
        (s: string) => '뭔가 ' + s.split(' ').slice(-2).join(' ') + ' 같은',
        (s: string) => s.split(' ').reverse().slice(0, 3).join(' '),
        (s: string) => s + '였나?',
    ];
    return transforms[Math.floor(Math.random() * transforms.length)](summary);
}

// 해석 왜곡 — 추론 레벨 (텍스트 변환 X)
function distortInterpretation(summary: string, characters: string[]): string {
    const char = characters[0] || '주인공';
    const distortions = [
        `${char} 배신하려는 거 아님?`,
        `${char} 사실 거짓말한 거 같은데`,
        `${char} 여기서 죽는 건 아니지?`,
        `이거 ${char} 흑화 떡밥 아닌가`,
        `${char} 결국 돌아올 수밖에 없을 듯`,
        `${char} 진심인지 모르겠음`,
        `이거 나중에 복선 회수되는 거 같은데`,
        `아 이거 ${char} 함정인데`,
        `${char} 이러다 진짜 죽을 수도`,
        `결국 ${char} 책임인 거 아님?`,
    ];
    return distortions[Math.floor(Math.random() * distortions.length)];
}

// ========== Stage 5: 집단 동조 파동 (Herd Effect — 리얼 군집) ==========
function injectHerdEffect(comments: string[]): string[] {
    // 30% 확률로만 발생
    if (Math.random() > 0.3 || comments.length < 4) return comments;

    const candidates = comments.filter(c => c.length >= 5 && !/^[ㅋㅠㄷㅇ]+$/.test(c));
    if (candidates.length === 0) return comments;

    const seedIdx = Math.floor(Math.random() * candidates.length);
    const seed = candidates[seedIdx];
    const keywords = seed.match(/[가-힣]{2,}/g) || [];
    if (keywords.length === 0) return comments;
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];

    console.log(`👥 Herd: seed="${seed}", keyword="${keyword}"`);

    // 받아치기 스타일 동조 (독립적이 아니라 반응형)
    const echoTemplates = [
        `ㄹㅇ ${keyword} 개빡셀 듯`,
        `ㅋㅋ 진짜 ${keyword} 또 나오네`,
        `${keyword} 미쳤다 ㄷㄷ`,
        `와 ${keyword} 소름`,
        `${keyword} 진짜 이번엔`,
        `나만 ${keyword} 보고 소름?`,
    ];
    const counterTemplates = [
        `아니 ${keyword}은 좀 질림`,
        `${keyword} 또야?`,
        `${keyword} 왜 다 난리임`,
        `걍 그냥저냥인데`,
        `그거 그렇게 대단한가`,
    ];

    const echoCount = 2 + Math.floor(Math.random() * 2);
    const echoes = echoTemplates.sort(() => Math.random() - 0.5).slice(0, echoCount);
    const counter = counterTemplates[Math.floor(Math.random() * counterTemplates.length)];

    // 리얼 군집 배치: 씨앗 위치 찾고 2연속 + 끼어들기 + 재등장
    const result = [...comments];
    const seedPosition = result.indexOf(seed);
    const insertAt = seedPosition >= 0 ? seedPosition + 1 : result.length;

    // echo[0], echo[1] 연속 → 반동 끼어들기 → (있으면) echo[2] 재등장
    const cluster: string[] = [];
    cluster.push(echoes[0]);
    if (echoes.length >= 2) cluster.push(echoes[1]);
    cluster.push(counter);  // 반동 끼어들기
    if (echoes.length >= 3) cluster.push(echoes[2]);  // 재등장

    result.splice(insertAt, 0, ...cluster);
    console.log(`👥 Herd: +${echoes.length} echoes, +1 counter (clustered at pos ${insertAt})`);
    return result;
}

// ========== Stage 6: 감정 증폭 파동 ==========
function amplifyEmotions(comments: string[]): string[] {
    const result = [...comments];

    // 고감정 댓글 감지 (ㅋㅋㅋ 3개 이상, ㅠㅠ 2개 이상, ㅅㅂ 등)
    const highEmotionIdx: number[] = [];
    result.forEach((c, i) => {
        if (/[ㅋ]{3,}/.test(c) || /[ㅠ]{2,}/.test(c) || /ㅅㅂ|미쳤|ㅁㅊ/.test(c)) {
            highEmotionIdx.push(i);
        }
    });

    if (highEmotionIdx.length === 0) return result;

    // 고감정 댓글 인접에 감정 부스터 삽입 (50% 확률)
    const boosters = [
        '와 소름', 'ㄹㅇ', '인정', '이거 진짜', 'ㅋㅋㅋㅋㅋ',
        'ㅠㅠ', '와', '대박', 'ㅇㅈ', '크',
    ];

    let inserted = 0;
    for (const idx of highEmotionIdx) {
        if (Math.random() < 0.5 && inserted < 2) {
            const booster = boosters[Math.floor(Math.random() * boosters.length)];
            // 고감정 댓글 바로 뒤에 삽입
            result.splice(idx + 1 + inserted, 0, booster);
            inserted++;
            console.log(`🔥 Emotion amp: "${booster}" after "${result[idx + inserted - 1]}"`);
        }
    }

    return result;
}

// ========== Stage 4: Comment Generation (4회 분리 호출 — 30 페르소나) ==========
async function generateDeepContextComments(
    episodeContent: string,
    genreWeights: Record<string, number> = {},
    count: number = 8,
    sourceLanguage: string = 'ko'
): Promise<{ comments: string[]; midComments: string[]; detectedTags: string[] }> {

    // ===== Stage 1: Event Extraction =====
    console.log('📋 Stage 1: Extracting events...');
    const extraction = await extractEvents(episodeContent);
    const { events, dominantEmotion } = extraction;

    if (events.length === 0) {
        console.warn('⚠️ No events extracted, falling back to old method');
        return { comments: [], midComments: [], detectedTags: [] };
    }

    // ===== Stage 1.5: DB 장르 가중치로 페르소나 선택 =====
    const personas = selectPersonasForGenre(genreWeights, count);

    // ===== Stage 2: Reader Profiles =====
    console.log('👥 Stage 2: Generating reader profiles...');
    const profiles = generateReaderProfiles(events, personas, dominantEmotion);
    for (const p of profiles) {
        console.log(`  ${p.personaId}(${p.type}): attention=${p.attentionSpan.toFixed(2)}, noise=${p.memoryNoise.toFixed(2)}, emotion=${p.emotionalIntensity.toFixed(2)}${p.bandwagonTarget ? `, bandwagon=${p.bandwagonTarget}` : ''}${p.dominantEmotion ? `, mood=${p.dominantEmotion}` : ''}`);
    }

    // ===== Stage 3: Info Restriction =====
    console.log('🔒 Stage 3: Building reader views...');
    const readerViews = profiles.map(p => ({
        profile: p,
        view: buildReaderView(events, p),
    }));

    // ===== Stage 4: callGroup별 분리 GPT 호출 =====
    const moodHint = dominantEmotion ? `\n분위기: 이 화는 전체적으로 "${dominantEmotion}" 느낌이 강하다.` : '';

    // 장르 힌트 주입 (GENRE_HINTS에서 가져옴)
    const primaryGenre = Object.entries(genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const genreHintText = GENRE_HINTS[primaryGenre]?.[sourceLanguage] || GENRE_HINTS[primaryGenre]?.['ko'] || '';
    const genreHint = genreHintText ? `\n${genreHintText}` : '';
    if (primaryGenre) console.log(`📖 Genre hint applied: ${primaryGenre} (${sourceLanguage})`);

    const platform = '한국 웹소설 모바일 앱. 방금 읽고 바로 폰으로 치는 댓글.';

    // callGroup별 분류
    const immersedViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'immersed';
    });
    const overreactorViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'overreactor';
    });
    const chaosViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'chaos';
    });
    const casualViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'casual';
    });

    console.log(`📊 Call groups: immersed=${immersedViews.length}, overreactor=${overreactorViews.length}, chaos=${chaosViews.length}, casual=${casualViews.length}`);

    // Scene reference context (top 3 events for context-specific comments)
    const sceneContext = events.slice(0, 3)
        .filter(e => e.quote && e.quote.length > 0)
        .map(e => `"${e.quote}" (${e.summary})`)
        .join(', ');

    // Episode excerpt for deep context (last 500 chars = climax/cliffhanger area)
    const episodeExcerpt = episodeContent.length > 500
        ? episodeContent.slice(-500)
        : episodeContent;

    // --- 호출 1: 몰입형 + 분석형 (페르소나별 말투 주입) ---
    const call1Prompt = immersedViews.length > 0 ? `${platform}
요약하지 마. 네가 읽은 장면에서 꼽힌 부분을 바로 말해.${moodHint}${genreHint}

[방금 읽은 장면]
${episodeExcerpt}
${sceneContext ? `핵심: ${sceneContext}` : ''}

${immersedViews.map((r, i) => {
        const bandwagon = r.profile.bandwagonTarget ? ` "${r.profile.bandwagonTarget}"한테 꽂힘.` : '';
        return `[${i + 1}번 독자: 감정강도 ${Math.round(r.profile.emotionalIntensity * 10)}/10]
기억: ${r.view}${bandwagon}
사고 초점: ${r.profile.personaCognitive}
말투: ${r.profile.personaTone}
행동: ${r.profile.personaStyle}
어미: ${r.profile.personaEndings.join(', ')}`;
    }).join('\n')}

이런 톤이 섞여야 한다:
"아까 눈 마주친 거 그냥 넘어갈 리 없지"
"저때 표정 봐 뭔가 알고 있었네"
"담장 넘고 나서 첫마디가 저건가 ㅋㅋ"
"카일 결단 빨랐는데 후회할 듯"
"이건 좀 과한데"
⚠️ 위 문장 그대로 쓰지 말고, 이번 화에서 네가 읽은 장면을 근거로 변형해라

[출력 — JSON]
{ "tags": ["battle/romance/betrayal/cliffhanger/comedy/powerup/death/reunion 중 해당"], "comments": ["${Math.min(immersedViews.length * 2, 8)}개"] }` : null;

    // --- 호출 2: 감정폭발형 (페르소나별 말투 주입) ---
    const call2Prompt = overreactorViews.length > 0 ? `${platform}
방금 읽고 폰 던질 뻔한 사람들. 감정이 앞서서 타이핑 엉망. 설명하지 마라.${moodHint}${genreHint}

[방금 읽은 장면]
${episodeExcerpt}

${overreactorViews.map((r, i) => {
        const bandwagon = r.profile.bandwagonTarget ? ` "${r.profile.bandwagonTarget}"한테 감정이입 심함.` : '';
        return `[${i + 1}번 독자: 감정강도 ${Math.round(r.profile.emotionalIntensity * 10)}/10]
장면: ${r.view}${bandwagon}
사고 초점: ${r.profile.personaCognitive}
말투: ${r.profile.personaTone}
행동: ${r.profile.personaStyle}
어미: ${r.profile.personaEndings.join(', ')}`;
    }).join('\n')}

이런 톤:
"아니 ㅋㅋㅋㅋ 미쳤냐 진짜"
"와씨 개쫄림"
"ㅠㅠㅠㅠㅠ 안돼"
"하 진짜 왜 저래"
⚠️ 위 문장을 그대로 반복하지 말고 비슷한 결로 변형해라

[출력 — JSON]
{ "comments": ["${Math.min(overreactorViews.length * 2, 6)}개"] }` : null;

    // --- 호출 3: 냉소형 + 오독형 — 🔒 보호 영역 ---
    const call3Prompt = chaosViews.length > 0 ? `${platform}
이 독자들은 호의적이지 않거나 잘못 이해하고 있다. 그래도 방금 읽은 장면을 근거로 말해라.${moodHint}${genreHint}

[방금 읽은 장면]
${episodeExcerpt}

${chaosViews.map((r, i) => {
        const bandwagon = r.profile.bandwagonTarget ? ` "${r.profile.bandwagonTarget}" 싫어함.` : '';
        const memoryLabel = r.profile.type === 'misreader' ? '기억(틀림)' : '기억';
        return `[${String.fromCharCode(65 + i)}: ${r.profile.type === 'misreader' ? '잘못 이해' : '짜증/비꼼'}]${bandwagon}
${memoryLabel}: ${r.view}
사고 초점: ${r.profile.personaCognitive}
말투: ${r.profile.personaTone}
행동: ${r.profile.personaStyle}
어미: ${r.profile.personaEndings.join(', ')}`;
    }).join('\n')}

[출력 — JSON]
{ "comments": ["${Math.min(chaosViews.length * 2, 4)}개"] }` : null;

    // --- 호출 4: 밀/드립형 + 가벼운 반응 ---
    const call4Prompt = casualViews.length > 0 ? `${platform}
이 독자들은 가벼운 톤으로 반응하지만, 방금 읽은 장면을 근거로 말해야 한다. 단문 금지.${moodHint}${genreHint}

[방금 읽은 장면]
${episodeExcerpt}

${casualViews.map((r, i) => {
        return `[${String.fromCharCode(65 + i)}: ${r.profile.type === 'lurker' ? '드립/밀형' : '가벼운 반응'}]
기억: ${r.view}
사고 초점: ${r.profile.personaCognitive}
말투: ${r.profile.personaTone}
행동: ${r.profile.personaStyle}
어미: ${r.profile.personaEndings.join(', ')}`;
    }).join('\n')}

[출력 — JSON]
{ "comments": ["${Math.min(casualViews.length * 2, 4)}개"] }` : null;

    // --- 호출 5: 중간밀도 (7~18자, 장면 언급, 분석 안 함) ---
    const call5Prompt = `${platform}
너는 웹소설 독자다. 방금 읽은 에피소드에 7~18자 짧은 댓글 5개 생성.

[규칙]
✅ 장면 언급하되 분석 안 함
✅ 캐릭터 언급하되 감상문 아님
✅ 7~18자
✅ 장르 톤 유지${genreHint}

❌ 문장 끝에 마침표 쓰지 마라
❌ 존댓말 금지
❌ 2문장 이상 금지
❌ 접속사 사용 금지 (그리고, 하지만, 그래서)
❌ 분석, 복선 추론, 작가 의도 언급 금지

좋은 예:
"여기서 각성하네ㅋㅋ"
"이 장면 소름"
"드디어 만났다ㅠ"

나쁜 예:
"각성 장면이 너무 인상적이었다." (마침표, 존댓말)
"주인공이 각성하는 장면을 보니, 정말 성장한 것 같다" (2문장, 감상문)

[방금 읽은 장면]
${episodeExcerpt.substring(0, 300)}

[출력 — JSON]
{ "comments": ["15개"] }`;

    // ===== 5회 병렬 호출 (빈 그룹은 skip) =====
    console.log('🧠 Stage 4: Persona-based cognitive calls...');
    const prompts = [call1Prompt, call2Prompt, call3Prompt, call4Prompt, call5Prompt].filter(Boolean) as string[];
    const rawResults = await Promise.all(prompts.map(p => callAzureGPT(p)));

    // ===== 결과 합치기 (chaos 보호 분리) =====
    const safeComments: string[] = [];
    const chaosComments: string[] = [];
    let detectedTags: string[] = [];

    const parseComments = (raw: string | null): string[] => {
        if (!raw) return [];
        const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        // GPT가 앞에 붙이는 라벨 제거 패턴
        const stripLabel = (c: string) => {
            let s = c
                .replace(/^["']|["']$/g, '')
                // Remove '원댓글: "..." → 반응:' pattern
                .replace(/^원댓글:.*?[→→]\s*반응:\s*/g, '')
                // Remove character name prefix: "소월: 대사" → "대사"
                .replace(/^[가-힣]{2,5}[：:]\s*/g, '')
                // Remove common comment labels + genre-specific keywords
                .replace(/^(반응|원댓글|독자[A-Z]?|[A-Z]|감상|댓글|코멘트|의견|답글|복선|설정|각성|서사|전투|액션|심쿵|케미|회귀|성장|스킬|마력|분위기|연출|묘사|캐릭터|전개|반전|긴장|소름|감동)[：:\-→|]\s*/g, '')
                .replace(/^["']|["']$/g, '') // strip quotes again after label removal
                .trim();
            return s;
        };
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed.tags) {
                detectedTags = (parsed.tags || []).filter((t: string) =>
                    ['battle', 'romance', 'betrayal', 'cliffhanger', 'comedy', 'powerup', 'death', 'reunion'].includes(t)
                );
            }
            return (parsed.comments || [])
                .map((c: string) => stripLabel(c))
                .filter((c: string) => c.length >= 8 && c.length < 100);
        } catch {
            return raw.split('\n')
                .map((l: string) => stripLabel(l.replace(/^\d+[\.)\\-]\s*/, '')))
                .filter((l: string) => l.length >= 8 && l.length < 100);
        }
    };

    // 프롬프트 순서에 맞게 결과 분배
    let resultIdx = 0;
    if (call1Prompt) safeComments.push(...parseComments(rawResults[resultIdx++] || null));
    if (call2Prompt) safeComments.push(...parseComments(rawResults[resultIdx++] || null));
    if (call3Prompt) chaosComments.push(...parseComments(rawResults[resultIdx++] || null)); // 🔒 보호
    if (call4Prompt) safeComments.push(...parseComments(rawResults[resultIdx++] || null));

    // ===== 중간밀도 품질 필터 =====
    const midDensityQualityScore = (text: string): number => {
        let score = 10;

        // 길이 체크
        if (text.length < 7 || text.length > 18) score -= 4;

        // 금지 패턴
        if (/것 같다|느껴졌다|보였다/.test(text)) score -= 3;
        if ((text.match(/,/g) || []).length >= 2) score -= 2;
        if (/[\.。]$/.test(text)) score -= 2; // 마침표 끝
        if (/입니다|습니다|되었다/.test(text)) score -= 2; // 존댓말

        // 반복 어휘 감점 (메타 단어)
        if (/각성|복선|설정/.test(text)) score -= 1;

        // 장르 톤 보너스
        if (/ㅠ/.test(text) && primaryGenre === 'romance_fantasy') score += 1;
        if (/ㅋㅋ/.test(text) && primaryGenre === 'game_fantasy') score += 1;

        return score;
    };

    const midComments: string[] = call5Prompt
        ? parseComments(rawResults[resultIdx++] || null).filter(c => midDensityQualityScore(c) >= 6)
        : [];

    // 중간밀도는 별도 풀로 유지 (70/20/10 비율 시스템에서 사용)
    // safeComments에 병합하지 않음

    console.log(`📊 Raw: safe=${safeComments.length}, chaos=${chaosComments.length}, mid=${midComments.length}`);

    // ===== Stage 5: 집단 동조 파동 (safe만) =====
    console.log('👥 Stage 5: Herd effect...');
    const withHerd = injectHerdEffect(safeComments);

    // ===== Stage 6: 감정 증폭 =====
    console.log('🔥 Stage 6: Emotion amplification...');
    const withEmotion = amplifyEmotions(withHerd);

    console.log(`📊 After social dynamics: ${safeComments.length} → ${withEmotion.length}`);

    // ===== Stage 7: GPT-5 큐레이터 (safe만, chaos 제외) =====
    const chaosRoll = Math.random();
    const chaosInsertCount = Math.min(chaosComments.length, chaosRoll < 0.1 ? 0 : chaosRoll < 0.6 ? 1 : 2);
    const curatorTarget = Math.max(1, count - chaosInsertCount);
    const filtered = await curateWithGPT5(withEmotion, curatorTarget);

    // chaos 보호 영역에서 1~2개 추출 후 랜덤 위치 삽입
    const selectedChaos = chaosComments.sort(() => Math.random() - 0.5).slice(0, chaosInsertCount);
    const finalMerged = [...filtered];
    for (const chaos of selectedChaos) {
        const pos = Math.floor(Math.random() * (finalMerged.length + 1));
        finalMerged.splice(pos, 0, chaos);
    }

    console.log(`🧠 Final: ${filtered.length} curated + ${selectedChaos.length} chaos = ${finalMerged.length}, tags: [${detectedTags.join(', ')}]`);
    return { comments: finalMerged, midComments, detectedTags };
}


// ========== Stage 5: GPT-5 Statistical Curator ==========
async function curateWithGPT5(comments: string[], targetCount: number = 8): Promise<string[]> {
    // --- 코드 사전필터: AI 티 나는 것만 감점 ---
    const abstractNouns = ['관계', '심리', '마음', '의미', '감정', '순간', '시작', '존재', '가치'];
    const essayWords = ['묘사', '장면', '인상적', '상징', '느껴진다', '감동적', '여운', '긴장감'];

    const scored = comments.map(comment => {
        const cleaned = comment.replace(/\.$/g, '').trim();
        let score = 50;

        // AI 티 감점
        if (/[가-힣]+의\s*[가-힣]+[이가은는을를]/.test(cleaned)) score -= 15;  // 소유격 과다
        const abstractCount = abstractNouns.filter(n => cleaned.includes(n)).length;
        score -= abstractCount * 10;  // 추상어
        const essayCount = essayWords.filter(w => cleaned.includes(w)).length;
        score -= essayCount * 12;  // 해설 톤
        if (/[가-힣]+[이가]\s*[가-힣]+(다|해|네|음|져|워)/.test(cleaned)) score -= 10;  // 설명형
        // 🆕 지나친 문장 완성도 감점
        if (cleaned.length > 15 && !cleaned.includes('ㅋ') && !cleaned.includes('ㅠ')
            && !cleaned.includes('?') && !cleaned.includes('…')) score -= 10;

        // 쉴표 감점 (AI 티)
        const commaCount = (cleaned.match(/,/g) || []).length;
        score -= commaCount * 15;

        // 🆕 감정 설명형 패턴 (-20) — 감상문 톤
        if (/(것\s*같다|느껴졌|전달되|인상\s*깊|압도적|몰입된|와닿|여운이)/.test(cleaned)) score -= 20;

        // 🆕 소유격 체인 2개 이상 (-30) — 사실상 컷
        const possessiveCount = (cleaned.match(/의\s/g) || []).length;
        if (possessiveCount >= 2) score -= 30;

        // 🆕 같은 단어 3회 이상 반복 (-15) — AI 패턴
        const wordCounts: Record<string, number> = {};
        cleaned.split(/\s+/).forEach(w => {
            if (w.length >= 2) {
                const stem = w.replace(/[이가은는의을를에서도]$/, '');
                if (stem.length >= 2) wordCounts[stem] = (wordCounts[stem] || 0) + 1;
            }
        });
        const maxRepeat = Math.max(0, ...Object.values(wordCounts));
        if (maxRepeat >= 3) score -= 15;

        // 가점 (인간적 특징)
        if (cleaned.length <= 5) score += 20;
        if (cleaned.includes('?') || /[뭐왜뭔어떻]/.test(cleaned)) score += 10;  // 줄임 (15→10)
        if (cleaned.includes('…') || cleaned.includes('..')) score += 10;
        if (/[ㅋㅠㄷ]{2,}/.test(cleaned)) score += 10;
        if (/[ㅁㅊㄹㅇㅂㅅㅎ]{2,}/.test(cleaned)) score += 15;
        // 단정형 가점 (~임, ~다, ~네, ~듯)
        if (/(임|다|네|듯|각|데)$/.test(cleaned)) score += 10;

        return { text: cleaned, score };
    });

    // 하위 20%만 제거 (오독/이상치 보호를 위해 관대하게)
    scored.sort((a, b) => b.score - a.score);
    const preFiltered = scored.slice(0, Math.ceil(scored.length * 0.8));
    const preDropped = scored.slice(Math.ceil(scored.length * 0.8));
    for (const d of preDropped) {
        console.log(`🔪 AI-tell filter (${d.score}점): "${d.text}"`);
    }

    // --- GPT-5 큐레이터: 집단 통계 기반 선택 ---
    const commentList = preFiltered.map((s, i) => `${i}: "${s.text}"`).join('\n');

    const curatorPrompt = `댓글 ${preFiltered.length}개 중 ${targetCount}개 골라.
깔끔하거나 정돈된 세트는 가짜다. 길이 다르고 톤 다른 게 자연스럽다.

${commentList}

[출력 — JSON]
{ "selected": [번호 ${targetCount}개] }`;

    const curatorRaw = await callOpenAIReview(curatorPrompt);
    let finalComments: string[] = [];

    if (curatorRaw) {
        try {
            const cleaned = curatorRaw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            const curatorData = JSON.parse(cleaned);
            if (curatorData.selected && Array.isArray(curatorData.selected)) {
                finalComments = curatorData.selected
                    .filter((idx: number) => idx >= 0 && idx < preFiltered.length)
                    .map((idx: number) => preFiltered[idx].text);
                console.log(`🧠 GPT-5 curator selected: [${curatorData.selected.join(', ')}]`);
            }
        } catch (e) {
            console.warn('⚠️ GPT-5 curator parse failed, falling back');
        }
    }

    if (finalComments.length < targetCount) {
        console.log('📊 Fallback: code-based selection');
        finalComments = preFiltered.slice(0, targetCount).map(s => s.text);
    }

    // --- Stage 8: 후처리 노이즈 ---
    const noised = finalComments.map(text => {
        // 쉼표 제거 (과도하지 않게: 2개 이상만)
        if ((text.match(/,/g) || []).length >= 2) {
            text = text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        }
        // 마침표 제거
        text = text.replace(/\.$/, '').replace(/\.\s/g, ' ').trim();
        // 40% 확률로 물음표 댓글을 단정형으로 변환
        if (text.includes('?') && Math.random() < 0.5) {
            text = text.replace(/\?+$/, '')
                .replace(/(일|는 건|는거|는걸|를|을)\s*(까|가)$/, '$1듯')
                .replace(/(럼|처럼)$/, '인듯');
            if (!text.endsWith('듯') && !text.endsWith('인듯')) {
                const assertEndings = ['임', '인듯', '네', '다', '각'];
                text = text + assertEndings[Math.floor(Math.random() * assertEndings.length)];
            }
        }
        if (Math.random() < 0.1 && text.length > 5) {
            const words = text.split(' ');
            if (words.length >= 2) text = words.slice(0, -1).join(' ');
        }
        if (Math.random() < 0.08 && !text.includes('ㅋ')) text += 'ㅋㅋ';
        return text;
    });

    // (쓸데없는 댓글은 딥컨텍스트에서 제거 — 템플릿 전용)

    // 셔플 (70% 랜덤, 느슨하게)
    for (let i = noised.length - 1; i > 0; i--) {
        if (Math.random() < 0.7) {
            const j = Math.floor(Math.random() * (i + 1));
            [noised[i], noised[j]] = [noised[j], noised[i]];
        }
    }

    console.log(`📊 Curated: ${noised.length}/${comments.length}`);
    return noised;
}

// ============================================================
// 하위 장르 → 상위 카테고리 매핑 (4-Tier Taxonomy)
// ============================================================

const GENRE_CATEGORY_MAP: Record<string, string> = {
    // === Fantasy → fantasy ===
    'High Fantasy': 'fantasy',
    'Dark Fantasy': 'fantasy',
    'Urban Fantasy': 'fantasy',
    'Mythology Retelling': 'fantasy',

    // === Fantasy → game-fantasy ===
    'GameLit / LitRPG': 'game-fantasy',
    'Cultivation': 'game-fantasy',
    'Progression': 'game-fantasy',
    'Dungeon / Tower': 'game-fantasy',

    // === Fantasy/Action → murim ===
    'Murim': 'murim',
    'Martial Arts': 'murim',

    // === Romance → romance ===
    'Contemporary Romance': 'romance',
    'Historical Romance': 'romance',
    'Romantic Fantasy': 'romance',
    'Paranormal Romance': 'romance',
    'Romantic Comedy': 'romance',
    // Tropes that map to romance
    'CEO / Billionaire': 'romance',
    'Enemies to Lovers': 'romance',
    'Forbidden Love': 'romance',
    'Omegaverse': 'romance',
    'Slow Burn': 'romance',

    // === Narrative Devices → regression ===
    'Isekai': 'regression',
    'Regression': 'regression',
    'Reincarnation': 'regression',
    'Transmigration': 'regression',
    'Time Travel': 'regression',

    // === Sci-Fi → scifi ===
    'Space Opera': 'scifi',
    'Cyberpunk': 'scifi',
    'Steampunk': 'scifi',
    'Post-Apocalyptic': 'scifi',
    'Hard Sci-Fi': 'scifi',
    'Mecha': 'scifi',
    'Virtual Reality': 'scifi',

    // === Mystery/Thriller → mystery ===
    'Psychological Thriller': 'mystery',
    'Crime': 'mystery',
    'Detective': 'mystery',
    'Cozy Mystery': 'mystery',
    'Revenge': 'mystery',
    'Espionage': 'mystery',
    'Whodunit': 'mystery',

    // === Horror → horror ===
    'Supernatural Horror': 'horror',
    'Cosmic Horror': 'horror',
    'Gothic': 'horror',
    'Psychological Horror': 'horror',
    'Zombie': 'horror',
    // Legacy names (keep for backward compat)
    'Gothic Horror': 'horror',
    'Supernatural': 'horror',
    'Survival Horror': 'horror',
    'Body Horror': 'horror',
    'Folk Horror': 'horror',

    // === Historical → historical ===
    'Historical Fiction': 'historical',
    'Alternate History': 'historical',
    'Period Drama': 'historical',
    'War': 'historical',
    // Legacy names
    'Historical Fantasy': 'historical',
    'Court Intrigue': 'historical',
    'War Epic': 'historical',
    'Dynasty': 'historical',

    // === Contemporary → slice-of-life ===
    'Slice of Life': 'slice-of-life',
    'Coming of Age': 'slice-of-life',
    'Tragedy': 'slice-of-life',
    'School Life': 'slice-of-life',
    'Workplace': 'slice-of-life',
    'Family': 'slice-of-life',
    // Legacy names
    'Contemporary': 'slice-of-life',
    'Family Drama': 'slice-of-life',
    'Melodrama': 'slice-of-life',

    // === Action → action ===
    'Superhero': 'action',
    'Military': 'action',
    'Survival': 'action',
    'Apocalypse': 'action',
    // Legacy names
    'Apocalyptic': 'action',
    'Battle Royale': 'action',
    'Sports': 'action',

    // === Comedy → comedy ===
    'Satire': 'comedy',
    'Parody': 'comedy',
    // Legacy names
    'Slapstick': 'comedy',
    'Dark Comedy': 'comedy',

    // Note: LGBTQ+, Cozy, Grimdark, Dark Academia, Werewolf/Vampire → tropes, no persona mapping
    // Note: YA, New Adult, Adult → audience tier, no persona mapping
};


// ============================================================
// 장르별 × 언어별 GPT 힌트 (Multilingual Genre Hints)
// ============================================================

const GENRE_HINTS: Record<string, Record<string, string>> = {
    'fantasy': {
        'ko': `\n\n[장르: 판타지 | 한국어 댓글 스타일]
- 최소 8자 이상 (단문 금지 — "와", "ㅇㅈ", "인정" 같은 건 쓰지 마라)
- 쉼표 거의 사용 안 함
- 방금 읽은 장면에서 인상 깊은 부분을 직접 언급해라
- "복선", "설정" 같은 메타 용어보다 장면 자체를 말해라
- 에피소드에 없는 인물 이름을 만들어내지 마라

금지:
- 로맨스 어휘 ("심쿵", "달달", "케미", "설렘")
- 같은 키워드 조합 반복 (댓글마다 다른 단어 사용)
- 장면을 다시 설명하지 말고, 그 장면에 대한 네 반응을 말해라`,

        'zh': `\n\n[类型：奇幻 | 中文评论风格]
- 形容词夸张
- 感叹词重复
- "太强了", "逆天", "离谱" 常用
- 哈哈哈, ？？？？使用频繁
- 情感比例：夸张情感 50%, 应援 20%, 分析 15%, 集体反应 15%

示例：
- 太强了，离谱！
- 主角逆天啊哈哈哈
- 这才是天才！！！
- 作者写的真好`,

        'ja': `\n\n[ジャンル：ファンタジー | 日本語コメントスタイル]
- 完結形文章
- 丁寧語/敬語
- ｗ使用
- 過激語ほぼなし
- 感情比率：個人感想 60%, 分析 20%, 応援 15%, 批判 5%

例：
- この展開好きです
- キャラが魅力的ですね
- 設定が面白いｗ
- 続きが気になります`,

        'en': `\n\n[Genre: Fantasy | English comment style]
- Longer sentences with commas
- Analytical tone
- "lol", "bro", "ngl" casual slang
- Irony/sarcasm acceptable
- Emotion mix: Analysis 40%, Emotion 25%, Discussion 20%, Humor 10%, Filler 5%

Examples:
- The magic system makes sense here, ngl
- Character development is insane
- This world-building though...
- Can't wait to see how this plays out`,

        'es': `\n\n[Género: Fantasía | Estilo de comentario en español]
- Muchas exclamaciones
- JAJAJA repetido
- MAYÚSCULAS para énfasis
- Expresiones exageradas
- Proporción: Emoción 50%, Apoyo 20%, Análisis 15%, Humor 10%, Crítica 5%

Ejemplos:
- ¡NO PUEDE SER!
- JAJAJA este capítulo estuvo increíble
- ¡Qué giro tan épico!
- El personaje merece más amor`,
    },

    'game-fantasy': {
        'ko': '\n\n[장르: 게임판타지]\n스탯/빌드/확률/레벨 같은 수치 반응 포함 OK. "밸패", "이 빌드 사기" 같은 표현.',
        'zh': '\n\n[类型：游戏奇幻]\n游戏系统/数值/技能反应。"这装备太强", "技能配置离谱"等表达。',
        'ja': '\n\n[ジャンル：ゲーム系ファンタジー]\nステータス/スキル/レベルアップ反応。"このビルド強すぎ"など。',
        'en': '\n\n[Genre: GameLit/LitRPG]\nStats/build discussions, leveling excitement. "OP build", "min-maxing" OK.',
        'es': '\n\n[Género: Fantasía de juego]\nEstadísticas/construcción/nivel. "Build roto", "Stats increíbles".',
    },

    'romance': {
        'ko': `\n\n[장르: 로맨스 | 한국어 댓글 스타일]\n\n어휘:\n- 핵심: "각", "케미", "심쿵", "답답", "후회각", "질투", "레전드"\n- 평가: 약함(좋음, 달달) → 중간(쩔어, 미쳤다) → 강함(ㅁㅊ, 심장 터짐)\n- 구조: [감정/상황] + [평가/반응] (5-15자)\n\n톤:\n- 감정 폭발 50% (ㅠㅠ, 심쿵, 미쳤다)\n- 답답함/비판 20% (왜 저래, 답답)\n- 커플 응원 20% (케미 쩔어, 빨리)\n- 쉼표 거의 없음\n\n금지:\n- 판타지 어휘 ("복선", "각성", "설정", "전투")\n- 3줄 이상 문장\n- 같은 패턴 반복 ("~각" 연속 사용 금지)\n- 프롬프트 문구 그대로 복사`,
        'zh': `\n\n[类型：言情 | 中文评论风格]\n- 过度形容词, 哈哈哈/？？？？\n- "甜死了", "虐死我了", "磕到了" 常用\n- 情感比例：情感夸张 60%, CP应援 20%, 分析 10%\n\n关注点：男主霸道/宠溺, 权力差, "虐"文化\n行动模式：CP应援集体化, 男主权力性正面消费\n\n示例:\n- 甜死了！！！\n- 男主太宠了哈哈哈\n- 虐死我了求作者手下留情\n- 这CP我磕了`,
        'ja': `\n\n[ジャンル：ロマンス | 日本語コメントスタイル]\n- 完結形文章, 丁寧語\n- ｗ使用, 過激語なし\n- 感情比率：個人感想 60%, 応援 20%, 分析 15%\n\n注目点：感情の繊細さ, 小さな仕草, 日常交流\n行動パターン：感情分析多い, 攻撃性低い, 静かな応援\n\n例:\n- この空気好きです\n- キュンとしましたｗ\n- 告白シーン良かった\n- 二人の関係が素敵`,
        'en': `\n\n[Genre: Romance | English comment style]\n- Natural comma usage\n- "lol", "omg", "girl", "bro"\n- Sarcasm/irony acceptable\n- Emotion mix: Analysis 40%, Emotion 30%, Discussion 20%\n\nFocus: Character psychology, relationship health, red flags\nBehavioral: Toxic analysis, "He's a red flag" common\n\nExamples:\n- Finally but he needs therapy lol\n- This relationship is toxic ngl\n- She deserves better\n- The slow burn is killing me`,
        'es': `\n\n[Género: Romance | Estilo de comentario en español]\n- Muchas exclamaciones, JAJAJA\n- MAYÚSCULAS para emoción\n- "DIOS", "NOOO", "POR FAVOR"\n- Proporción: Emoción 60%, Apoyo 20%\n\nEnfoque: Celos, obsesión, confesión\nPatrón: Emoción excesiva, lágrimas/rabia extremas\n\nEjemplos:\n- ¡NO PUEDE SER!\n- DIOS MIO POR FIN SE BESARON\n- ¡Qué celos! JAJAJA\n- ¡ESTOY LLORANDO!`,
    },

    'murim': {
        'ko': '\n\n[장르: 무협]\n경지/체급/초식/내공 같은 무협 표현. "화경?", "체급차이" OK.',
        'zh': '\n\n[类型：武侠]\n境界/招式/内功等武侠表达。"这是什么境界", "招式太强"。',
        'ja': '\n\n[ジャンル：武侠]\n境地/技/内功など武侠表現。"この技すごい"など。',
        'en': '\n\n[Genre: Martial Arts]\nRealm/technique/cultivation terms. "Transcendent realm!", "OP technique".',
        'es': '\n\n[Género: Artes marciales]\nNivel/técnica/cultivo. "¡Qué técnica!", "Nivel superior".',
    },

    'regression': {
        'ko': `\n\n[장르: 회귀/이세계 | 한국어 댓글 스타일]
- 짧은 단문
- "각", "사기", "루트", "빌드"
- ㅋㅋ은 냉소
- 공략형/최적화 집착

소비 성향: 정보 우위 활용 집착, 루트 최적화, 전개 속도 민감
행동 패턴: 전략 토론, 회차 비교, 설정 오류 빠른 지적

예시:
- 각 나옴
- 루트 사기네
- 저기서 왜 저래
- 빌드 말이 안 됨
- 정보 써먹네
- 설정 오류`,

        'zh': `\n\n[类型：重生/穿越 | 中文评论风格]
- 夸张形容词, 哈哈哈
- 情感过热, 集体汇聚
- 위상 상승/체급 소비

消费倾向：力量上升最重要, 血统/特别性强调, 复仇叙事过热
行动模式：主角赞扬集体化, 地位比较

示例：
- 太强了！！
- 这境界牛逼
- 血统觉醒！
- 复仇爽哈哈哈`,

        'ja': `\n\n[ジャンル：異世界/転生 | 日本語コメントスタイル]
- 完結形文章, ｗ使用
- 過激語少ない
- 적응 서사/일상화 소비

消費傾向：異世界適応期, 転生日常, 能力より関係
行動：落ち着いた感想, キャラ関係中心

例：
- こういう設定好き
- 異世界適応が丁寧
- キャラとの関係いい
- ゆっくり成長型好きです`,

        'en': `\n\n[Genre: Regression/Isekai/LitRPG | English comment style]
- Natural commas, "lol", "bro"
- Sarcasm exists
- 정합성/패러독스 집착

Consumption: Timeline logic, system coherence, cheat verification
Behavior: Long analysis, paradox criticism, setting collapse critique

Examples:
- Timeline paradox detected
- This doesn't add up lol
- System logic broken here
- Plot hole in the regression mechanic`,

        'es': `\n\n[Género: Regresión/Isekai | Estilo de comentario en español]
- Exclamaciones muchas, JAJAJA
- 감정형 성장 소비

Consumo: Trampa < emoción, proceso de crecimiento, relaciones
Comportamiento: MAYÚSCULAS emocionales, empatía colectiva

Ejemplos:
- ¡Qué crecimiento tan hermoso!
- ¡NOOOO el sacrificio!
- ¡Me encanta esta relación!
- JAJAJA qué poder`,
    },

    'scifi': {
        'ko': `\n\n[장르: SF | 한국어 댓글 스타일]
- 짧은 분석 단문
- 쉼표 거의 없음
- "설정", "개연성", "세계관" 반복
- ㅋㅋ은 비꼼용
- 감정 비율: 분석 45%, 반응 25%, 비판 15%, 감정 10%

집착 포인트: 과학 설정 말이 되는지, 타임루프/양자 정합성, 복선 회수
행동 패턴: 설정 오류 바로 지적, 반전 화 댓글 밀도 급증, 감정 < 논리

예시:
- 이 설정 말 됨?
- 타임패러독스 무시네
- 양자역학이 그게 아닌데
- 복선 회수 ㅁㅊ`,

        'zh': `\n\n[类型：科幻 | 中文评论风格]
- 过度表达, "牛逼", "炸了", "离谱"
- 哈哈哈 反复
- 情感比例：情感/赞扬 50%, 분석 20%, 应援 20%

关注点：技术规模, 文明等级, 宇宙地位, 主角天才性
行动模式：规模大反应爆炸, 主角科学力赞扬, 集体情绪

示例：
- 这科技太牛逼了！
- 文明等级碾压哈哈哈
- 主角真是天才`,

        'ja': `\n\n[ジャンル：SF | 日本語コメントスタイル]
- 完結形文章, 丁寧語混在
- ｗ使用, 過激語少ない
- 感情比率：感想 40%, 分析 30%, 応援 20%

注目点：設定ディテール, メカ/AIキャラ性, 情緒的余韻
行動パターン：感想+分析混合, 攻撃性低い, 技術ディテール称賛

例：
- この設定好きです
- 技術描写が細かいですねｗ
- AIキャラが魅力的
- 余韻が残る展開でした`,

        'en': `\n\n[Genre: Sci-Fi | English comment style - MOST DEBATE-HEAVY]
- Long sentences with commas
- Natural conjunctions
- Sarcasm mixed, "lol", "dude", "bro"
- Emotion mix: Analysis 50%, Discussion 25%, Emotion 15%

Focus: Physics laws, tech feasibility, AI ethics, philosophical questions
Behavioral: Physics calculations appear, black hole/quantum debates, idea > character

Examples:
- The physics actually checks out here
- Wait but that violates thermodynamics lol
- The ethical implications though...
- This AI debate is getting interesting`,

        'es': `\n\n[Género: Ciencia Ficción | Estilo de comentario en español]
- Muchas exclamaciones, MAYÚSCULAS
- JAJAJA
- Proporción: Emoción 45%, Análisis 25%, Apoyo 20%

Enfoque: Traición/sacrificio, humanidad, IA-humano relación
Patrón: Emoción central, personajes > tecnología, empatía colectiva

Ejemplos:
- ¡LA TECNOLOGÍA ES INCREÍBLE!
- ¡El sacrificio me hizo llorar!
- JAJAJA qué giro`,
    },

    'mystery': {
        'ko': `\n\n[장르: 미스터리/스릴러 | 한국어 댓글 스타일]
- 짧은 단문 추측
- 쉼표 거의 없음
- "범인각", "복선", "설정오류" 등장
- ㅋㅋ은 비꼼용
- 감정 비율: 추측 40%, 분석 25%, 놀람 20%, 비판 10%

집착 포인트: 범인 추측, 떡밥 회수, 반전 납득 여부, 설정 구멍
행동 패턴: 추측 댓글 빠르게 늘어남, 반전 → 댓글 폭증, 허술하면 냉소

예시:
- 범인 저 사람 아님?
- 이거 복선이었네
- 반전 납득 안 됨
- 떡밥 회수 ㅁㅊ
- 이거 영화에서 본 전개`,

        'zh': `\n\n[类型：悬疑/惊悚 | 中文评论风格]
- 感情夸张, "离谱", "炸裂"
- 哈哈哈/？？？？
- 情感比例：情感 45%, 推测 25%, 应援/批评 20%

关注点：背叛, 家族/义理, 阴谋, 权力结构
行动模式：主角偏向强, 凶手批评集中化, 道德判断频繁

示例：
- 这是背叛！！
- 凶手太可恶了
- 主角真聪明哈哈哈
- 这阴谋太深了`,

        'ja': `\n\n[ジャンル：ミステリー/スリラー | 日本語コメントスタイル]
- 完結形文章, 丁寧語
- ｗ使用, 過激語ほぼなし
- 感情比率：推測 35%, 感想 35%, 分析 20%

注目点：心理描写, 手がかりの繊細さ, トリック完成度
行動パターン：落ち着いた推測, "伏線かな"のような慎重な表現

例：
- もしかして犯人は...？
- 伏線かなと思いました
- 心理描写が細かいですね
- このトリック好きです`,

        'en': `\n\n[Genre: Mystery/Thriller | English comment style - MOST ANALYTICAL]
- Long sentences with commas
- Sarcasm present, "lol", "dude"
- Emotion mix: Analysis 50%, Discussion 25%, Surprise 15%

Focus: Psychological validity, trick logic, investigation realism
Behavioral: Long culprit theories, real crime comparisons, active debate

Examples:
- My theory: the killer is X because...
- This makes no sense from a forensic standpoint
- Plot hole detected lol
- The psychology checks out actually`,

        'es': `\n\n[Género: Misterio/Suspenso | Estilo de comentario en español]
- Muchas exclamaciones, MAYÚSCULAS
- JAJAJA
- Proporción: Emoción 45%, Especulación 30%, Crítica 15%

Enfoque: Traición, escenas impactantes, miedo emocional
Patrón: Reacción colectiva en shock, crítica excesiva al asesino

Ejemplos:
- ¡NOOOO EL ASESINO!
- ¡Qué traición tan horrible!
- JAJAJA no lo vi venir
- ¡Este giro me dejó sin palabras!`,
    },

    'horror': {
        'ko': `\n\n[장르: 공포 | 한국어 댓글 스타일]
- 매우 짧음 (초단문 비율 매우 높음)
- "소름", "미쳤음", "무섭네"
- ㅠㅠ는 불안, ㅋㅋ은 긴장 완화
- 감정 비율: 비명/놀람 40%, 추측 25%, 분석 15%

집착 포인트: 소름 장면, 복선, 귀신 정체
행동 패턴: 갑툭튀 → 댓글 폭증, 설정 오류 → 바로 식음

예시:
- 소름
- 미쳤음
- 헐
- 귀신 나옴?
- 무섭네ㅠㅠ
- 밤에 읽으면 안 될듯
- 불 켜고 본다`,

        'zh': `\n\n[类型：恐怖 | 中文评论风格]
- 过度表达, "吓死我了", "离谱"
- 哈哈哈 (紧张缓解)
- 情感比例：情感夸张 50%, 设定推测 20%

关注点：冤魂/鬼设定, 因果报应, 复仇
行动模式：集体尖叫, 道德解释, 鬼设定讨论

示例：
- 吓死我了！！！
- 这鬼太可怕了
- 因果报应哈哈哈
- 快更新啊`,

        'ja': `\n\n[ジャンル：ホラー | 日本語コメントスタイル - 独特な雰囲気重視]
- 完結形文章, 丁寧語
- ｗは少ない, 過剰表現ほぼなし
- 感情比率：感想 40%, 不安表現 30%, 推測 20%

注目点：雰囲気, 静的恐怖, 心理的圧迫, 日常の不安
行動パターン：落ち着いた感想, 余韻言及, 幽霊より雰囲気

例：
- こういう静かな怖さ好き
- 雰囲気が不気味ですね
- 心理描写がリアル
- 余韻が残ります`,

        'en': `\n\n[Genre: Horror | English comment style]
- Medium sentences, natural commas
- Sarcasm present
- "nah", "nope", "hell no"
- Emotion mix: Surprise 30%, Analysis 30%, Humor 20%

Focus: Gore intensity, jump scares, psychological trauma, social metaphor
Behavioral: Character criticism, "Don't go in there" memes, trauma analysis

Examples:
- Nope nope nope not going there
- Why would you open that door?? lol
- The psychological horror is chef's kiss
- Classic horror movie mistake`,

        'es': `\n\n[Género: Terror | Estilo de comentario en español]
- Exclamaciones excesivas, MAYÚSCULAS
- JAJAJA, "NOOOO", "DIOS"
- Proporción: Emoción 50%, Sorpresa 25%

Enfoque: Escenas de shock, descripciones crueles, aparición del fantasma
Patrón: Gritos colectivos, concentración emocional, reacción instantánea

Ejemplos:
- ¡NOOOO QUÉ MIEDO!
- ¡DIOS MIO NO PUEDE SER!
- ¡Esto es demasiado terrorífico!
- JAJAJA qué susto`,
    },

    'historical': {
        'ko': `\n\n[장르: 역사물 | 한국어 댓글 스타일]
- 비교적 단문, 쉼표 적음
- "고증", "왜곡", "사료", "설정"
- ㅋㅋ은 비꼼용
- 감정 비율: 고증 지적 35%, 감정 25%, 정치 해석 20%

집착 포인트: 고증 정확성, 인물 왜곡 여부, 정치 해석, 시대 분위기
행동 패턴: 고증 오류 지적 빠름, 정치적 해석 싸움 발생

예시:
- 이거 실제 기록이랑 다름
- 고증 오류네
- 이건 너무 미화
- 저 인물 왜곡 심함
- 정치 해석이 좀...`,

        'zh': `\n\n[类型：历史 | 中文评论风格 - 历史消费大市场]
- 过度形容词, "牛逼", "炸了"
- 集体赞扬/批评, 哈哈哈
- 情感比例：情感/赞扬 40%, 战略分析 25%, 政治 20%

关注点：皇帝/将军地位, 权力规模, 战略, 民族自豪
行动模式：伟大人物赞扬, 民族情绪强, 背叛/义理过热

示例：
- 这皇帝太强了！
- 战略牛逼哈哈哈
- 民族英雄！
- 作者写的太好了`,

        'ja': `\n\n[ジャンル：歴史 | 日本語コメントスタイル]
- 完結形文章, 丁寧語
- 過激語ほぼなし, ｗ少ない
- 感情比率：感想 45%, 分析 30%, 応援 15%

注目点：人物心理, 時代雰囲気, 繊細なディテール, 文化描写
行動パターン：落ち着いた感想, 考証指摘も丁寧, 喧嘩少ない

例：
- こういう時代描写好きです
- ディテールが細かいですね
- 人物心理がリアル
- 雰囲気が良いです`,

        'en': `\n\n[Genre: Historical | English comment style]
- Long sentences with commas
- Sarcasm present
- Real history comparisons
- Emotion mix: Analysis 40%, Discussion 30%, Emotion 20%

Focus: Social implications, human rights/ethics, power structures, modern interpretations
Behavioral: Moral evaluations, historical interpretation debates, political discussions

Examples:
- This feels historically inaccurate
- The power dynamics make sense here
- Interesting take on [historical figure]
- From a modern lens, this is problematic`,

        'es': `\n\n[Género: Histórico | Estilo de comentario en español]
- Muchas exclamaciones, MAYÚSCULAS
- JAJAJA
- Proporción: Emoción 45%, Política/poder 25%, Análisis 20%

Enfoque: Conflictos de poder, traición, drama emocional, revolución
Patrón: Inmersión emocional, explosión en traición, interpretación política emocional

Ejemplos:
- ¡NOOOO LA TRAICIÓN!
- ¡Viva la revolución!
- ¡Este poder es increíble!
- JAJAJA qué estrategia`,
    },

    'slice-of-life': {
        'ko': `\n\n[장르: 일상/현대물 | 한국어 댓글 스타일]
- 짧은 단문, 쉼표 거의 없음
- "현실적이네", "공감됨", "저게 맞지"
- ㅋㅋ은 체념/냉소
- 감정 비율: 공감 45%, 냉소 20%, 감정 20%

집착 포인트: 현실 공감, 회사/학교 상황, 부모 세대 문제, 경제적 현실
행동 패턴: "나도 저랬음" 등장, 회사 이야기 → 댓글 밀도 상승

예시:
- 나도 저랬음
- 이게 현실이지
- 현실적이네
- 공감됨
- 회사 그렇지ㅋㅋ
- 저게 맞음`,

        'zh': `\n\n[类型：日常/现代 | 中文评论风格]
- 感情夸张, "太真实了"
- 集体共鸣评论
- 情感比例：情感 50%, 共鸣 25%, 应援 15%

关注点：家庭义务, 孝, 世代冲突, 成功/出人头地
行动模式：父母世代争论, 牺牲叙事消费, 集体情绪

示例：
- 太真实了！
- 父母就是这样
- 家庭责任太重
- 主角加油`,

        'ja': `\n\n[ジャンル：日常系 | 日本語コメントスタイル]
- 完結形文章, 丁寧語
- "こういう日常好き"
- 感情比率：感想 50%, 共感 30%, 応援 15%

注目点：日常ディテール, 静かな感情変化, 教室雰囲気
行動パターン：落ち着いた感想, 小さな場面反応, 喧嘩ほぼなし

例：
- こういう日常好きです
- わかります
- 穏やかな展開ですね
- ディテールが良いです`,

        'en': `\n\n[Genre: Contemporary/Slice of Life | English comment style]
- Long sentences (higher ratio)
- Natural commas, "this hits hard"
- Emotion mix: Empathy 40%, Analysis 30%, Discussion 20%

Focus: Personal growth, independence, self-discovery, workplace power
Behavioral: Long personal experience sharing, psychological analysis

Examples:
- I went through this exact thing
- This hits so hard ngl
- Been there, done that
- My parents were like this too`,

        'es': `\n\n[Género: Contemporáneo/Cotidiano | Estilo de comentario en español]
- Muchas exclamaciones, MAYÚSCULAS
- "NOOO", "DIOS", JAJAJA
- Proporción: Emoción 55%, Empatía 25%

Enfoque: Conflictos emocionales, traición, sacrificio, padre-hijo
Patrón: Explosión emocional, empatía colectiva, exageración

Ejemplos:
- ¡Esto mismo me pasó!
- ¡NOOOO QUÉ TRISTEZA!
- ¡Siento tanto por el personaje!
- JAJAJA así son las familias`,
    },

    'action': {
        'ko': `\n\n[장르: 액션 | 한국어 댓글 스타일]

어휘:
- 핵심: "체급", "간지", "사이다", "전투", "연출", "스킬", "각도"
- 평가: 약함(괜찮네, 좋음) → 중간(쩔어, 쩐다) → 강함(ㅁㅊ, 개간지, 소름)
- 구조: [동작/상황] + [짧은 평가] (3-10자)

톤:
- 흥분/감탄 40% (개간지, ㅁㅊ, 소름)
- 분석/전략 25% (체급차, 저기서 왜)
- 사이다 반응 25% (사이다네ㅋㅋ)
- 초단문 비율 높음 (3-5자)

금지:
- 로맨스 어휘 ("심쿵", "케미", "달달")
- 장황한 설명 (2줄 이상)
- 같은 패턴 연속 (체급 2회 이상 연속 금지)`,

        'zh': `\n\n[类型：武侠/动作 | 中文评论风格 - 武侠特别强]
- 过度表达, "太强了", "牛逼"
- 哈哈哈, 集体赞扬
- 情感比例：情感/赞扬 50%, 境界分析 25%

关注点：境界, 血统, 地位, 规模
行动模式：主角强 → 情感爆炸, 境界阶段言及, 集体应援

示例：
- 太强了！！
- 这境界牛逼
- 主角无敌哈哈哈
- 作者写的好`,

        'ja': `\n\n[ジャンル：アクション/ヒーロー | 日本語コメントスタイル]
- 完結形文章, 丁寧語混在
- ｗ使用, 過激語少ない
- 感情比率：感想 40%, 技言及 25%, 応援 20%

注目点：キャラクター性, 技ディテール, チームワーク, 犠牲
行動パターン：戦闘よりキャラ感情, 技名言及, 批判少ない

例：
- こういうバトル好き
- 技名がかっこいい
- チームワークが良い
- 犠牲シーン辛い`,

        'en': `\n\n[Genre: Action/Military/Superhero | English comment style]
- Long sentences (combat analysis)
- Sarcasm exists, "bro", "dude"
- Emotion mix: Analysis 40%, Humor 20%, Emotion 20%, Discussion 20%

Focus: Tactical realism, equipment, ethics issues, team strategy
Behavioral: Equipment discussion, military realism critique, hero ethics debate

Examples:
- The tactics actually make sense here
- That weapon choice is questionable lol
- Hero ethics debate incoming
- Solid team strategy ngl`,

        'es': `\n\n[Género: Acción/Apocalipsis | Estilo de comentario en español]
- MAYÚSCULAS, exclamaciones excesivas
- JAJAJA
- Proporción: Emoción 50%, Reacción 25%

Enfoque: Situaciones extremas, sacrificio, traición, explosión emocional
Patrón: Reacción colectiva, crisis → emoción, apoyo a personajes

Ejemplos:
- ¡NOOOO QUÉ ACCIÓN!
- ¡Increíble pelea!
- ¡El sacrificio! 😭
- JAJAJA qué golpe`,
    },

    'comedy': {
        'ko': `\n\n[장르: 코미디 | 한국어 댓글 스타일]
- 초단문 매우 많음
- ㅋㅋ 롱테일 분포 (ㅋ ~ ㅋㅋㅋㅋㅋㅋㅋㅋ)
- "미쳤냐", "레전드", "이건 좀"
- 감정 비율: 비명형 웃음 45%, 단문 반응 30%, 밈 15%

집착 포인트: 타이밍, 예상 밖 반전, 병맛, 말장난
행동 패턴: 펀치라인 → 댓글 폭증, ㅋㅋ 길이 경쟁, 캐릭터 별명 생성

예시:
- ㅋㅋㅋㅋㅋㅋ
- 미쳤냐ㅋㅋㅋ
- 레전드
- 이건 좀
- 개웃김ㅋㅋ
- 미침`,

        'zh': `\n\n[类型：搞笑 | 中文评论风格]
- 初段文 높음, 哈哈哈 반복
- "笑死我了", 夸张形容词
- 情感比例：笑 50%, 情感夸张 30%, 梗扩展 15%

关注点：夸张, 情况极端化, 人物出丑
行动模式：集体笑声, 人物调侃, 梗扩展

示例：
- 哈哈哈哈哈
- 笑死我了
- 太搞笑了
- 作者太有才了`,

        'ja': `\n\n[ジャンル：コメディ | 日本語コメントスタイル]
- ｗ使用, 完結形文章
- 過激語少ない, 語調柔らかい
- 感情比率：感想 40%, ｗ笑い 35%, 応援 15%

注目点：小さなギャグ, キャラ性格差, 状況コメディ
行動パターン：落ち着いた笑い, 状況蓄積型, キャラ中心

例：
- こういうノリ好きｗ
- キャラが面白い
- 癒されますｗｗ
- ギャグセンスいいですね`,

        'en': `\n\n[Genre: Comedy/Satire | English comment style - META-HEAVY]
- Medium sentences, "lol" moderate
- Sarcasm heavy
- Emotion mix: Humor 40%, Satire interpretation 25%, Meme 20%, Discussion 15%

Focus: Irony, social satire, meta jokes, character self-deprecation
Behavioral: Joke interpretation, political/social connections, meme expansion

Examples:
- The irony here is chef's kiss lol
- This is literally [meme reference]
- Meta commentary on point
- Satire so good it hurts`,

        'es': `\n\n[Género: Comedia | Estilo de comentario en español]
- JAJAJA, MAYÚSCULAS de risa
- Exclamaciones muchas
- Proporción: Risa 55%, Emoción 25%, Memes 15%

Enfoque: Exageración emocional, personajes ridículos, situación explosiva
Patrón: Risa colectiva, reacción explosiva, burla a personajes

Ejemplos:
- JAJAJAJAJA
- ¡QUÉ GRACIOSO!
- ¡Me muero de risa! 😂
- ¡Esto es oro!`,
    },
};

/**
 * 소설 장르에서 상위 카테고리 추출
 */
function getGenreCategory(genreData: string | string[] | null): string | null {
    if (!genreData) return null;

    const genres = Array.isArray(genreData)
        ? genreData
        : genreData.split(',').map(g => g.trim());

    for (const genre of genres) {
        const category = GENRE_CATEGORY_MAP[genre];
        if (category) return category;
    }

    return null;
}

/**
 * 하위장르 개수 기반 상위 카테고리 가중치 계산
 * 예: Romance×2, Regression×1 → { romance: 0.667, regression: 0.333 }
 */
function getGenreWeights(genreData: string | string[] | null): Record<string, number> {
    if (!genreData) return {};

    const genres = Array.isArray(genreData)
        ? genreData
        : genreData.split(',').map(g => g.trim());

    // 상위 카테고리별 하위장르 개수 카운트
    const counts: Record<string, number> = {};
    for (const genre of genres) {
        const category = GENRE_CATEGORY_MAP[genre];
        if (category) {
            counts[category] = (counts[category] || 0) + 1;
        }
    }

    // 가중치 계산 (합 = 1.0)
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return {};

    const weights: Record<string, number> = {};
    for (const [cat, count] of Object.entries(counts)) {
        weights[cat] = count / total;
    }

    console.log(`📊 Genre weights: ${Object.entries(weights).map(([k, v]) => `${k}=${Math.round(v * 100)}%`).join(', ')}`);
    return weights;
}

/**
 * GPT로 에피소드 본문 기반 댓글 사전 생성 (with 장르 + 언어 힌트)
 */
async function generateDeepContextCommentsWithGenre(
    episodeContent: string,
    genreCategory: string | null,
    language: string = 'ko', // Default: Korean
    count: number = 15
): Promise<{ comments: string[]; detectedTags: string[] }> {
    const trimmed = episodeContent.length > 2000
        ? episodeContent.slice(-2000)
        : episodeContent;

    // 장르 + 언어별 힌트 가져오기 (fallback: ko)
    const genreHint = genreCategory
        ? (GENRE_HINTS[genreCategory]?.[language] || GENRE_HINTS[genreCategory]?.['ko'] || '')
        : '';

    const prompt = `너는 한국 웹소설 독자야. 방금 이 에피소드를 읽었어.${genreHint}

[필수 절차]
1. 가장 꽂힌 장면 1개를 내부적으로 고른다 (출력 안 함)
2. 그 장면에서 생긴 감정 1개만 쓴다
3. 댓글에 장면 단서(행동/대사/수치/상황) 최소 1개를 포함한다

[출력 형식 — 반드시 JSON]
{
  "tags": ["이 에피소드의 장면 태그. battle/romance/betrayal/cliffhanger/comedy/powerup/death/reunion 중 해당하는 것만"],
  "comments": ["댓글 ${count}개"]
}

[댓글 규칙]
- 5자 이하 초단문 3개, 한 줄 단문 4개, 두 줄 이상 1개
- ㅋㅋ, ㅠㅠ, ㄷㄷ, 초성체 자유
- ~다 어미 금지 (미쳤음/ㅁㅊ/미쳐 OK)
- 작품 전체 평가 금지 ("전개 좋네", "재밌네" 같은 일반 감상 금지)
- 이모지 쓰지마

[참고 예시 — 이런 느낌으로]
거기서 칼 빼네
저 30퍼 터지네ㅋㅋ
웃다가 우는거 뛰임
아니 그걸 왜 지금 쒔
눈물에서 끝내냐

[에피소드 본문]
${trimmed}`;

    const raw = await callAzureGPT(prompt);
    if (!raw) return { comments: [], detectedTags: [] };

    // Markdown 코드 블록 제거 (```json ... ```)
    const cleanedRaw = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    // JSON 파싱 시도
    try {
        const parsed = JSON.parse(cleanedRaw);
        const comments = (parsed.comments || [])
            .map((c: string) => c.replace(/^["']|["']$/g, '').trim())  // 따옴표 제거
            .filter((c: string) => c.length > 0 && c.length < 100);
        const detectedTags = (parsed.tags || []).filter((t: string) =>
            ['battle', 'romance', 'betrayal', 'cliffhanger', 'comedy', 'powerup', 'death', 'reunion'].includes(t)
        );
        console.log(`🧠 Deep context: ${comments.length} comments, tags: [${detectedTags.join(', ')}]`);
        return { comments, detectedTags };
    } catch {
        // JSON 파싱 실패 시 줄바꿈 fallback
        const comments = raw.split('\n')
            .map(l => l.replace(/^\d+[\.)\-]\s*/, '').replace(/^"|"$/g, '').trim())
            .filter(l => l.length > 0 && l.length < 100);
        console.log(`🧠 Deep context (fallback): ${comments.length} comments, no tags`);
        return { comments, detectedTags: [] };
    }
}

/**
 * GPT로 부모 댓글에 어울리는 대댓글 생성
 */
async function generateContextualReply(parentComment: string): Promise<string> {
    const prompt = `너는 한국 웹소설 독자야. 방금 다른 사람이 쓴 댓글을 봤어.

[원댓글]
${parentComment}

위 댓글에 어울리는 짧은 반응 1개만 써줘.

[규칙]
- 5~15자 이내 초단문
- ㅇㅈ, ㄹㅇ, ㅋㅋ, ㅠㅠ 자유
- 원댓글 맥락에 맞춰서
- ~다 어미 금지
- 텍스트만 출력 (레이블, 따옴표, 설명 일절 금지)

예시:
미쳤음ㅋㅋ → ㄹㅇ
카일 죽을 듯 → 아니지 살 거야
전개 개빠름 → 인정ㅋㅋ
소름 → ㄷㄷㄷ`;

    const raw = await callAzureGPT(prompt);
    if (!raw) return '';

    let reply = raw.trim();

    // ─── 후처리 3단계 ───────────────────────────────────────
    // ① 코드블록 제거
    reply = reply.replace(/^```[\s\S]*?```/g, '').trim();

    // ② 줄바꿈 이후 레이블만 있는 첫 줄 제거
    //    예: "Reply:\nㄹㅇ" → "ㄹㅇ"
    reply = reply.replace(/^.{0,10}[:：]\s*\n/, '').trim();

    // ③ colon prefix: "대댓글: X", "반응: X", "Reply: X" 등
    //    첫 줄에서 콜론 앞이 10자 이하면 콜론 뒤만 추출
    const colonMatch = reply.match(/^[^:：\n]{1,10}[:：]\s*(.+)/);
    if (colonMatch) {
        reply = colonMatch[1];
    }

    // ④ bullet prefix: "- X", "• X", "> X", "* X"
    reply = reply.replace(/^[-•>*]\s+/, '');

    // ⑤ 따옴표 제거 (앞뒤)
    reply = reply.replace(/^["'"'「【\[]+|["'"'」】\]]+$/g, '').trim();

    // ─────────────────────────────────────────────────────────

    // 너무 길면 폐기
    if (reply.length > 50) return '';

    console.log(`💬 Contextual reply for "${parentComment.substring(0, 20)}...": "${reply}"`);
    return reply;
}


// ============================================================
// 메인 API 핸들러
// ============================================================
export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const novelId = searchParams.get('novel');
    const useDeep = searchParams.get('deep') === 'true';
    const baseCount = parseInt(searchParams.get('count') || '60');
    const density = parseFloat(searchParams.get('density') || '1.0');
    const totalCount = Math.round(baseCount * density);

    // 기본 가중치 (나중에 GPT 감지 결과로 덮어쓰기 가능)
    PERSONALITY_WEIGHTS = GENRE_WEIGHTS['default'];

    if (!novelId) {
        return NextResponse.json(
            { error: 'novel parameter required' },
            { status: 400 }
        );
    }

    try {
        console.log(`🤖[v2] Starting natural comment bot for ${novelId}...`);

        // 1. 에피소드 ID 조회
        const episodeResult = await db.query(
            `SELECT id, created_at FROM episodes WHERE novel_id = $1 ORDER BY ep ASC LIMIT 1`,
            [novelId]
        );

        if (episodeResult.rows.length === 0) {
            return NextResponse.json(
                { error: `No episodes found for ${novelId}` },
                { status: 404 }
            );
        }

        const episodeId = episodeResult.rows[0].id;
        const episodeCreatedAt = new Date(episodeResult.rows[0].created_at);
        console.log(`✅ Target episode: ${episodeId} `);

        // 1.5. 캐릭터 이름 로딩 (context-required 템플릿용)
        const entityResult = await db.query(
            `SELECT source_text FROM entities WHERE novel_id = $1 AND(category = 'character' OR category IS NULL) LIMIT 20`,
            [novelId]
        );
        const characterNames: string[] = entityResult.rows.map((r: { source_text: string }) => r.source_text);

        // 2. 기존 댓글 캐싱 (규칙 14: 답글 가중치용)
        const existingResult = await db.query(
            `SELECT c.id,
                    COALESCE(COUNT(r.id), 0) AS reply_count,
                    c.content
             FROM comments c
             LEFT JOIN comments r ON r.parent_id = c.id
             WHERE c.episode_id = $1
             GROUP BY c.id`,
            [episodeId]
        );
        const commentPool: { id: string; content: string; reply_count: number }[] = existingResult.rows.map((r: { id: string; content: string; reply_count: string }) => ({
            id: r.id,
            content: r.content,
            reply_count: parseInt(r.reply_count) || 0,
        }));

        // 3. 소설 장르 + 언어 조회
        const novelResult = await db.query(
            `SELECT genre, source_language FROM novels WHERE id = $1`,
            [novelId]
        );
        const genreData = novelResult.rows[0]?.genre;
        const sourceLanguage = novelResult.rows[0]?.source_language || 'ko'; // Default: Korean
        const genreCategory = getGenreCategory(genreData); // legacy (for old single-call function)
        const genreWeights = getGenreWeights(genreData);    // 가중치 기반

        console.log(`🌐 Source language: ${sourceLanguage}`);
        if (genreCategory) {
            console.log(`🎭 Genre category: ${genreCategory}`);
        }

        // 4. Deep Context GPT 댓글 사전 생성 (deep=true일 때만)
        let deepComments: string[] = [];
        let midDensityPool: string[] = [];
        let sceneTags: string[] = [];
        if (useDeep) {
            // 에피소드 본문 조회
            const contentResult = await db.query(
                `SELECT content FROM episodes WHERE id = $1`,
                [episodeId]
            );
            const episodeContent = contentResult.rows[0]?.content;
            if (episodeContent && episodeContent.length > 50) {
                console.log(`📖 Fetched episode content (${episodeContent.length} chars)`);

                let calls = 0;
                while (deepComments.length < totalCount && calls < 6) {
                    const result = await generateDeepContextComments(
                        episodeContent,
                        genreWeights,
                        15,             // count
                        sourceLanguage
                    );
                    deepComments.push(...result.comments);
                    midDensityPool.push(...result.midComments);
                    if (calls === 0) sceneTags = result.detectedTags;
                    calls++;
                    console.log(`   → 배치 ${calls}: +${result.comments.length}개 (총 ${deepComments.length}/${totalCount})`);
                }
            } else {
                console.log('⚠️ Episode content too short or null, skipping deep context');
            }
        }

        // 4. 봇 생성 & 댓글 작성
        const usedTemplates = new Set<string>();

        // 기존 댓글 닉네임 조회 — 동일 닉네임 방지
        const existingNicknameResult = await db.query(
            `SELECT DISTINCT u.name FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.episode_id = $1`,
            [episodeId]
        );
        const usedNicknames = new Set<string>(
            existingNicknameResult.rows.map((r: { name: string }) => r.name)
        );
        console.log(`📛 Existing nicknames: ${usedNicknames.size} (excluded from pool)`);
        let totalCommentsPosted = 0;
        const botCount = Math.ceil(totalCount / 1.3);

        for (let i = 0; i < botCount && totalCommentsPosted < totalCount; i++) {
            const nickname = pickNickname(usedNicknames);
            const tone = pickPersonalityTone();
            let commentCount = pickCommentCount();

            // 규칙 15: 동일 유저 연속 댓글 (15% 확률 — 짧은 감상 여러 개)
            if (Math.random() < 0.15) {
                commentCount = 2 + Math.floor(Math.random() * 2); // 2-3개
            }

            // 봇 계정 생성 (unique username)
            const timestamp = Date.now();
            const username = `bot_${timestamp}_${i} `;

            const userResult = await db.query(
                `INSERT INTO users(username, password_hash, name, is_hidden)
    VALUES($1, '', $2, FALSE)
                 RETURNING id`,
                [username, nickname]
            );

            const userId = userResult.rows[0].id;

            // 댓글 작성
            let lastCommentTime: Date | null = null;

            for (let j = 0; j < commentCount && totalCommentsPosted < totalCount; j++) {
                // 70/20/10 비율 시스템: 딥컨텍스트 70%, 중간밀도 20%, 템플릿 10%
                const roll = Math.random();
                let content: string;
                if (roll < 0.70 && deepComments.length > 0) {
                    // 딥컨텍스트 (70%)
                    content = deepComments.pop()!;
                } else if (roll < 0.90 && midDensityPool.length > 0) {
                    // 중간밀도 (20%)
                    content = midDensityPool.pop()!;
                } else {
                    // 템플릿 (10%) 또는 다른 풀 소진 시 fallback
                    if (deepComments.length > 0) {
                        content = deepComments.pop()!;
                    } else if (midDensityPool.length > 0) {
                        content = midDensityPool.pop()!;
                    } else {
                        break;
                    }
                }
                content = humanize(content);
                let createdAt = randomTimestamp(episodeCreatedAt);

                // 규칙 10: 같은 봇 댓글 간 5분~3시간 간격
                if (lastCommentTime) {
                    const minGap = 5 * 60 * 1000;
                    const maxGap = 3 * 60 * 60 * 1000;
                    const gap = Math.random() * (maxGap - minGap) + minGap;
                    createdAt = new Date(lastCommentTime.getTime() + gap);
                }
                lastCommentTime = createdAt;

                // 규칙 14: 답글 5% (GPT 맥락 기반)
                let parentId: string | null = null;
                if (Math.random() < 0.05 && commentPool.length > 0) {
                    // 부모 댓글 선택 (답글 많은 댓글 2배 확률)
                    const parentCommentId = weightedRandom(
                        commentPool.map(c => ({
                            item: c.id,
                            weight: c.reply_count > 0 ? 2.0 : 1.0,
                        }))
                    );
                    parentId = parentCommentId;

                    // 부모 댓글 내용 찾기
                    const parentComment = commentPool.find(c => c.id === parentCommentId);
                    if (parentComment) {
                        // GPT로 맥락 있는 대댓글 생성
                        const contextualReply = await generateContextualReply(parentComment.content);
                        if (contextualReply) {
                            content = contextualReply;  // 기존 content를 대체
                        }
                        // GPT 실패 시 기존 content 사용
                    }
                }

                const insertResult = await db.query(
                    `INSERT INTO comments (episode_id, user_id, content, parent_id, created_at)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [episodeId, userId, content, parentId, createdAt]
                );

                // 새 댓글을 풀에 추가 (답글 대상)
                commentPool.push({ id: insertResult.rows[0].id, content: content, reply_count: 0 });
                totalCommentsPosted++;
            }

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        console.log(`✅ Posted ${totalCommentsPosted} comments from ${botCount} unique bots`);

        return NextResponse.json({
            success: true,
            novel: novelId,
            episode: episodeId,
            botAccounts: botCount,
            commentsPosted: totalCommentsPosted,
            deepContextUsed: useDeep,
            deepCommentsGenerated: useDeep ? totalCount - deepComments.length : 0,
            deepCommentsRemaining: deepComments.length,
            detectedTags: sceneTags,
            azureConfigured: !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY),
            version: 'v3-deep-context',
        });

    } catch (error) {
        console.error('Comment Bot Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to run comment bot',
                details: String(error),
                azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'MISSING',
                azureKey: process.env.AZURE_OPENAI_API_KEY ? 'SET' : 'MISSING',
            },
            { status: 500 }
        );
    }
}
