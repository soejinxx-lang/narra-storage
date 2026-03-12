/**
 * Korean Language Pack — 카카오페이지/네이버시리즈 댓글 문화
 * 
 * 한국어 route.ts의 수집 데이터를 intl LanguagePack 형식으로 포팅.
 * - 초성체/비명/밈 문화 (55%+)
 * - Context-required 치환 템플릿 (70+개)
 * - 욕설/비속어 자연스러운 포함
 * - 카카오페이지/네이버시리즈 닉네임 295개 중 선별
 */

import type { LanguagePack, PersonalityTone, CallPromptArgs } from '../types';

// ============================================================
// 장르별 가중치
// ============================================================
const KO_GENRE_WEIGHTS: Record<string, { tone: PersonalityTone; weight: number }[]> = {
    fantasy: [
        { tone: 'short_reactor', weight: 55 },
        { tone: 'emotional', weight: 20 },
        { tone: 'theorist', weight: 10 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    'game-fantasy': [
        { tone: 'short_reactor', weight: 50 },
        { tone: 'theorist', weight: 20 },
        { tone: 'emotional', weight: 15 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    romance: [
        { tone: 'emotional', weight: 40 },
        { tone: 'short_reactor', weight: 25 },
        { tone: 'cheerleader', weight: 15 },
        { tone: 'theorist', weight: 12 },
        { tone: 'critic', weight: 8 },
    ],
    murim: [
        { tone: 'short_reactor', weight: 55 },
        { tone: 'emotional', weight: 15 },
        { tone: 'theorist', weight: 15 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    regression: [
        { tone: 'short_reactor', weight: 45 },
        { tone: 'theorist', weight: 25 },
        { tone: 'emotional', weight: 15 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    default: [
        { tone: 'short_reactor', weight: 55 },
        { tone: 'emotional', weight: 20 },
        { tone: 'theorist', weight: 10 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
};

// ============================================================
// 한국어 언어팩 (LanguagePack 구현)
// ============================================================
const koLangPack: LanguagePack = {
    code: 'ko',
    dataMaturity: 'PRODUCTION',

    // === 데이터 풀 (수집 닉네임) ===
    nicknamePool: [
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
        // PIA 스타일
        'PIA1619742997828', 'PIA1754845395185',
        // 추가
        '끝이아닌시작', '88m', '하Lin', '무공천마',
        '식료1weng', '박영기',
    ],

    // === 수집 댓글 템플릿 ===
    templates: {
        // 55% — 짧은 리액션, 비명, 밈, 초성체
        short_reactor: [
            'ㄷㄷ', 'ㅋㅋ', '헐', '👍', '뚝!', '??', 'ㅅㅂ', 'ㄹㅇ',
            'ㅇㅈ', '인정', '크', 'ㅁㅊ', '레전드', 'ㅇㅇ', '굿',
            '1', '6등',
            '끼에에에에엑!!!!', '?????????????????',
            '와 이건좋네ㅋㅋ', '오 이거괜찮은데?', '와ㅋㅋㅋ', '헐ㄷㄷ',
            '오 좋은데', '와 이건좀', '헐 진짜?', '오 그래?',
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
            '앤 쌍욕이 너무 나오는 느낌', '근데 쌍욕이 좀...',
            '아니 이보쇼 작가양반',
        ],
    },

    genreTemplates: {},

    // === 30 페르소나 (한국 웹소설 커뮤니티) ===
    personas: [
        // === Immersed (침착 몰입러) ===
        {
            id: 'A1', name: '감정이입러', baseType: 'immersed', callGroup: 'immersed',
            tone: '"소름ㄷㄷ", "눈물남ㅠ" 식의 짧은 감정 반응',
            style: '캐릭터 감정에 몰입, 특정 장면에 반응',
            endings: ['ㅠㅠ', '소름', '미쳤다'],
            cognitiveFocus: '캐릭터 표정, 대사, 행동'
        },
        {
            id: 'A2', name: '분위기충', baseType: 'immersed', callGroup: 'immersed',
            tone: '"이 분위기 미쳤다", "배경묘사 ㄹㅇ" 식',
            style: '배경과 분위기에 몰입, 글발 감상',
            endings: ['ㄹㅇ', '미쳤다', '이거지'],
            cognitiveFocus: '환경, 분위기, 문체'
        },
        {
            id: 'A3', name: '커플러', baseType: 'immersed', callGroup: 'immersed',
            tone: '"이 둘 제발", "{name1} {name2} 사귀어라" 식',
            style: '관계 전개에 집중',
            endings: ['제발', '사귀어라', '빨리'],
            cognitiveFocus: '캐릭터 관계, 로맨스'
        },
        {
            id: 'A4', name: '액션몰입러', baseType: 'immersed', callGroup: 'immersed',
            tone: '"전투씬 개쩔어", "뚝배기 깨버리네" 식',
            style: '전투/액션 장면에 집중',
            endings: ['ㄷㄷ', '개쩔어', '미쳤음'],
            cognitiveFocus: '전투, 액션, 파워'
        },
        {
            id: 'A5', name: '정주행러', baseType: 'immersed', callGroup: 'immersed',
            tone: '"정주행 중인데 여기서 멈출 수 없다" 식',
            style: '정주행 감상, 스토리 흐름 언급',
            endings: ['가즈아', '멈출 수 없다', '다음화'],
            cognitiveFocus: '스토리 전개'
        },

        // === Overreactor (과몰입러) ===
        {
            id: 'B1', name: '비명러', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '"끼에에에에엑!!", "ㅁㅊㅁㅊㅁㅊ" 식 비명',
            style: '극단적 감정 표현, 느낌표/물음표 과다',
            endings: ['!!!!', '?????', 'ㅁㅊ'],
            cognitiveFocus: '충격, 놀람, 흥분'
        },
        {
            id: 'B2', name: '밈러', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '"뚝배기 시원하게 깨버리네ㅋㅋ", "카...뽕차네" 식',
            style: '밈/유행어로 반응',
            endings: ['ㅋㅋㅋㅋ', '뽕차네', '개꿀잼'],
            cognitiveFocus: '유머, 밈'
        },
        {
            id: 'B3', name: '초성체러', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '"ㅅㅂ ㄹㅇ ㅁㅊ" 초성체 위주',
            style: '극도로 짧은 반응, 초성 중심',
            endings: ['ㅋㅋ', 'ㅅㅂ', 'ㄹㅇ'],
            cognitiveFocus: '즉각적 감정 방출'
        },
        {
            id: 'B4', name: '뽕맞은러', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '"이건좀 레전드네ㄷㄷ", "역대급" 식 극찬',
            style: '작품에 취해서 과도한 칭찬',
            endings: ['레전드', '역대급', 'ㄷㄷ'],
            cognitiveFocus: '극찬, 감탄'
        },
        {
            id: 'B5', name: '분노러', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '"아 ㅈㄴ화나" "답답해 미치겠네" 식',
            style: '스토리에 억울함/분노 표출',
            endings: ['미치겠네', '화나', 'ㅈㄴ'],
            cognitiveFocus: '분노, 억울함'
        },

        // === Chaos (혼란/트롤) ===
        {
            id: 'C1', name: '어그로', baseType: 'troll', callGroup: 'chaos',
            tone: '"이거 표절 아님?" "노잼인데" 식 시비',
            style: '논란 유발, 반대 의견 강하게',
            endings: ['ㅋㅋ', '아님?', '지쌉'],
            cognitiveFocus: '논란, 대립'
        },
        {
            id: 'C2', name: '오독러', baseType: 'misreader', callGroup: 'chaos',
            tone: '내용을 잘못 이해하고 댓글 작성',
            style: '스킵해서 잘못 해석',
            endings: ['아닌가?', '인듯', '맞지?'],
            cognitiveFocus: '오독, 혼동'
        },
        {
            id: 'C3', name: '스포러', baseType: 'troll', callGroup: 'chaos',
            tone: '"이거 나중에 반전인데" 식 가벼운 스포',
            style: '정주행 앞선 정보 언급',
            endings: ['ㅋㅋ', '스포아님', '기대해'],
            cognitiveFocus: '미래 전개 암시'
        },
        {
            id: 'C4', name: '간헐적불만러', baseType: 'troll', callGroup: 'chaos',
            tone: '"분량이 좀..." "이건 좀 아닌데" 식',
            style: '건설적이지 않은 짧은 불만',
            endings: ['좀...', '아닌데', '에바'],
            cognitiveFocus: '불만, 아쉬움'
        },
        {
            id: 'C5', name: '딴소리러', baseType: 'troll', callGroup: 'chaos',
            tone: '본문과 상관없는 이야기',
            style: '화제 탈선',
            endings: ['ㅋㅋ', '갑자기', '근데'],
            cognitiveFocus: '완전 다른 이야기'
        },

        // === Analyst (분석러) ===
        {
            id: 'D1', name: '복선헌터', baseType: 'analyst', callGroup: 'casual',
            tone: '"여기 떡밥 깔린 거 같은데" "복선 회수" 식',
            style: '서사 구조 추적',
            endings: ['인듯', '복선', '기억해둬'],
            cognitiveFocus: '서사 구조, 복선/회수'
        },
        {
            id: 'D2', name: '클리셰감별사', baseType: 'analyst', callGroup: 'casual',
            tone: '"이건 전형적인 X 전개" "반전인가" 식',
            style: '패턴/트로프 인식',
            endings: ['전개', '패턴', '클리셰'],
            cognitiveFocus: '트로프, 패턴'
        },
        {
            id: 'D3', name: '설정충', baseType: 'analyst', callGroup: 'casual',
            tone: '"이 설정은 말이 안되는데" "세계관 구멍" 식',
            style: '논리적 일관성 체크',
            endings: ['아닌데', '구멍', '모순'],
            cognitiveFocus: '설정 일관성'
        },
        {
            id: 'D4', name: '캐릭분석러', baseType: 'analyst', callGroup: 'casual',
            tone: '"이 캐릭 동기가" "성장 아크 좋다" 식',
            style: '캐릭터 심리 분석',
            endings: ['동기', '성장', '심리'],
            cognitiveFocus: '캐릭터 심리'
        },
        {
            id: 'D5', name: '세계관덕후', baseType: 'analyst', callGroup: 'casual',
            tone: '"마법체계가" "설정 미쳤다" 식',
            style: '세계관 집착',
            endings: ['설정', '체계', '세계관'],
            cognitiveFocus: '세계관, 마법체계'
        },

        // === Casual/Lurker ===
        {
            id: 'E1', name: '출첵러', baseType: 'lurker', callGroup: 'casual',
            tone: '"출첵" "잘 읽었습니다" 만 남김',
            style: '최소한의 참여',
            endings: ['출첵', '읽음', '감사'],
            cognitiveFocus: '존재 표시'
        },
        {
            id: 'E2', name: '한글자러', baseType: 'lurker', callGroup: 'casual',
            tone: '"ㅋ" "ㅇㅇ" "굿" 한 단어',
            style: '극도로 짧음',
            endings: ['ㅇㅇ', 'ㅋ', '굿'],
            cognitiveFocus: '최소 노력'
        },
        {
            id: 'E3', name: '이모지러', baseType: 'lurker', callGroup: 'casual',
            tone: '이모지/이모티콘 위주',
            style: '시각적 반응',
            endings: ['👍', '🔥', '💯'],
            cognitiveFocus: '이모지'
        },
        {
            id: 'E4', name: '질문러', baseType: 'skimmer', callGroup: 'casual',
            tone: '"다음화 언제?" "이거 뭐임?" 식 질문',
            style: '궁금하지만 깊지 않음',
            endings: ['?', '언제', '뭐임'],
            cognitiveFocus: '단순 질문'
        },
        {
            id: 'E5', name: '응원러', baseType: 'lurker', callGroup: 'casual',
            tone: '"화이팅" "잘 봤어요" 식 응원',
            style: '짧은 응원',
            endings: ['화이팅', '잘봤어요', '응원'],
            cognitiveFocus: '응원'
        },
    ],

    // === 장르별 가중치 ===
    genreWeights: KO_GENRE_WEIGHTS,
    defaultWeights: KO_GENRE_WEIGHTS.default,

    // === 댓글 개수 가중치 ===
    commentCountWeights: [
        { count: 1, weight: 95 },
        { count: 2, weight: 5 },
    ],

    // === 플랫폼 문자열 ===
    platformString: '카카오페이지/네이버시리즈',

    // === extractEvents 프롬프트 ===
    extractEventsPrompt: (trimmedContent: string) => `너는 카카오페이지에서 소설을 읽는 독자야. 방금 이 회차를 다 읽었어.

[필수 절차]
1. 가장 인상적인 장면 하나를 찾아 (출력하지 마)
2. 그 장면이 준 감정 하나를 적어
3. 반응할 때 장면 앵커 (행동/대사/숫자/상황) 하나 이상 포함해

[출력 형식 — JSON만]
{
  "dominantEmotion": "감정 하나: 긴장/슬픔/분노/웃김/스릴/로맨스/충격/감동",
  "events": [
    {
      "id": 1-8,
      "summary": "장면 기반 요약 (GPT식 요약 X, 직접 인용 가능한 수준)",
      "type": "action/emotion/dialogue/twist/reveal",
      "importance": 0.0-1.0,
      "characters": ["장면에 나오는 캐릭터 이름"],
      "quote": "임팩트 있으면 직접 인용",
      "detail": "선택적 디테일"
    }
  ]
}

[반응 규칙]
- 이벤트 5-8개
- 장면 기반 요약 (정돈된 요약 X)
- 직접적이고 인용 가능하게
- 감정은 하나만

[에피소드 본문]
${trimmedContent}`,

    // === 프롬프트 빌더 ===
    buildCall1Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `방금 카카오페이지에서 소설 한 화 읽었어. 바로 생각나는 거 쳐.

${args.sceneContext || 'N/A'}

${profileList}

요약 절대 금지. 설명 금지. 감상문 금지. 일어난 일 설명하지 마.
반쯤 딴짓하면서 치는 것처럼. 문장 안 끝나도 됨.
이모지 금지. 첫 언급 이후 대명사 써.

${args.targetCommentCount}개 댓글 생성.
One comment per line. No JSON. No numbering.`;
    },

    buildCall2Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `방금 소설 읽었는데 재밌었어. 빨리 쳐.

${args.sceneContext || 'N/A'}

${profileList}

흥분 표현하되 왜인지 설명하지 마. 분석 금지. "깊이가 느껴진다" "묘사가 좋다" 금지.
카카오페이지 댓글처럼 짧게. 초성체 OK.

${args.targetCommentCount}개 댓글 생성.
One comment per line. No JSON. No numbering.`;
    },

    buildCall3Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `소설 읽는데 집중 못 했어. 그래도 뭐라도 써.

${args.sceneContext || 'N/A'}

${profileList}

헷갈리거나, 지루하거나, 잘못 이해했어. 정정하지 마.
이모지 금지.

${args.targetCommentCount}개 댓글 생성.
One comment per line. No JSON. No numbering.`;
    },

    buildCall4Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `방금 한 화 끝. 짧은 핫테이크 하나.

${args.sceneContext || 'N/A'}

${profileList}

생각 하나만. "깊이감" "좋은 터치" "묘사가" 이런 거 금지.
문학 분석 금지. 이모지 금지.

${args.targetCommentCount}개 댓글 생성.
One comment per line. No JSON. No numbering.`;
    },

    buildCall5Prompt: (args) => `카카오페이지/네이버시리즈 댓글란에 있어. 감상문 아니고 댓글 써.

${args.sceneContext || 'N/A'}

규칙:
- "이 장면의 묘사가" "세계관 구축이" 식 시작 금지. 리뷰야 그건.
- 친구한테 카톡 치듯 써.
- 반말 OK. 초성체 OK. 문장 안 끝나도 됨.
- "ㅋㅋ" "ㅇㅈ" "ㄹㅇ" 같은 반응도 OK.
이모지 금지.

${args.targetCommentCount}개 댓글 생성.
One comment per line. No JSON. No numbering.`,

    buildReplyPrompt: (parentComment) => `카카오페이지 독자야. 이 댓글 봤어:

[댓글]
${parentComment}

짧은 대댓글 써 (2-15자).

[규칙]
- 완전한 문장이나 강한 반응 (단순 "ㅋ"만은 X)
- 자연스러운 한국어
- 반말 OK
- JSON 아니고 텍스트만 출력

예시:
댓글: "역대급이네ㄷㄷ" → 대댓글: "ㄹㅇ 인정"
댓글: "작가 언제와" → 대댓글: "존버해야지 뭐"
댓글: "복선 미쳤다" → 대댓글: "그건 복선 아닌듯"`,

    // === 후처리 함수 ===
    humanize: (comment) => {
        let result = comment;

        // 10% "ㅋ" 추가
        if (Math.random() < 0.10 && !result.includes('ㅋ')) {
            const suffix = ['ㅋㅋ', 'ㅋㅋㅋ', 'ㅋ'][Math.floor(Math.random() * 3)];
            result += suffix;
        }

        // 5% "ㄹㅇ" / "ㅇㅈ" 추가
        if (Math.random() < 0.05 && !result.includes('ㄹㅇ') && !result.includes('ㅇㅈ')) {
            const slang = ['ㄹㅇ', 'ㅇㅈ', 'ㅇㅇ'];
            result += ' ' + slang[Math.floor(Math.random() * slang.length)];
        }

        // 3% 오타
        if (Math.random() < 0.03 && result.length > 3) {
            const typos: [RegExp, string][] = [
                [/진짜/, '진쨔'],
                [/미쳤/, '미쳣'],
                [/대박/, '대바'],
                [/작가/, '작간'],
            ];
            const typo = typos[Math.floor(Math.random() * typos.length)];
            result = result.replace(typo[0], typo[1]);
        }

        return result;
    },

    applyDynamicVariations: (text) => {
        let result = text;

        // "ㅋ" 반복 변환 (20%)
        if (text.includes('ㅋㅋ') && Math.random() < 0.20) {
            const count = 2 + Math.floor(Math.random() * 6);
            result = result.replace(/ㅋ+/, 'ㅋ'.repeat(count));
        }

        // "ㅠ" 반복 (15%)
        if (text.includes('ㅠ') && Math.random() < 0.15) {
            const count = 1 + Math.floor(Math.random() * 4);
            result = result.replace(/ㅠ+/, 'ㅠ'.repeat(count));
        }

        // "!" 반복 (15%)
        if (text.includes('!') && Math.random() < 0.15) {
            const count = 1 + Math.floor(Math.random() * 4);
            result = result.replace(/!+/, '!'.repeat(count));
        }

        return result;
    },

    curateScoring: (comment) => {
        let score = 70;

        // === Tier 1: Instant kill (AI DNA) ===
        const instantKill = [
            /이 작품은/,
            /독자로서/,
            /작가의 의도/,
            /서사적/,
            /몰입감이 뛰어/,
            /캐릭터(?:의)? (?:성장|발전)(?:이|이라)/,
            /세계관 구축/,
            /묘사가 뛰어/,
            /깊이(?:가|를) (?:더하|느끼)/,
            /전개가 (?:탄탄|매끄러)/,
            /스토리텔링/,
            /(?:의미|가치)(?:가|를) (?:전달|담)/,
        ];
        for (const pattern of instantKill) {
            if (pattern.test(comment)) return { score: 0 };
        }

        // === Tier 2: Heavy penalty (-30) ===
        const aiPatterns = [
            /작품의 완성도/,
            /인상적(?:인|이었)/,
            /흥미로운 (?:전개|설정|캐릭터)/,
            /기대(?:가 |를 )(?:됩니다|모읍니다)/,
            /추천(?:합니다|드립니다)/,
            /\.(?:\s|$).*\./, // 여러 문장
        ];
        for (const pattern of aiPatterns) {
            if (pattern.test(comment)) score -= 30;
        }

        // === Tier 3: 구조 감점 (-10~20) ===
        if (comment.endsWith('습니다') || comment.endsWith('합니다')) score -= 15;
        if (comment.endsWith('습니다.') || comment.endsWith('합니다.')) score -= 20;
        if (/^이 (?:작품|소설|에피소드|장면)/.test(comment)) score -= 15;
        if (comment.length > 80) score -= 15;
        if (comment.length > 50 && !/[ㅋㅎㅠㅜ!?…]/.test(comment)) score -= 10;

        // === 🔥 Human Bonus ===
        if (/[ㅋㅎ]{2,}/.test(comment)) score += 5;
        if (/[ㅠㅜ]{2,}/.test(comment)) score += 4;
        if (/^[ㄱ-ㅎ]/.test(comment)) score += 6; // 초성 시작
        if (comment.length <= 5) score += 8;
        if (!/[.!?]$/.test(comment)) score += 5; // 끝 안맺음
        if (/[ㅅㅂ]/.test(comment) || /ㅈㄴ/.test(comment)) score += 3; // 비속어
        if (/ㄷㄷ|ㅁㅊ|ㄹㅇ|ㅇㅈ/.test(comment)) score += 4;
        if (/\?$/.test(comment) && comment.length <= 15) score += 6;

        return { score: Math.max(0, Math.min(120, score)) };
    },

    // === 집단 동조 ===
    extractKeyword: (text) => {
        const keywords = text.match(/(?:전투|로맨스|반전|복선|캐릭|설정|전개|작화|분량|작가)/);
        return keywords ? keywords[0] : null;
    },

    herdEchoTemplates: (keyword) => [
        `${keyword} ㄹㅇ`,
        `${keyword} 인정ㅋㅋ`,
        `${keyword} 미쳤다`,
        `${keyword} 개좋아`,
    ],

    herdCounterTemplates: (keyword) => [
        `${keyword} 좀 아닌데`,
        `${keyword} 별론데`,
        `${keyword} 그저그럼`,
    ],

    highEmotionPattern: /(?:소름|눈물|미쳤|대박|레전드|개쩔|충격|감동)/,

    emotionBoosters: [
        'ㅋㅋㅋㅋ',
        'ㄹㅇ',
        'ㅁㅊ',
        '진짜',
    ],

    // === 왜곡 ===
    distortEventText: (summary) => {
        return summary.replace(/[가-힣]+(?:이|가|을|를)/, '뭔가');
    },

    distortInterpretation: (summary, characters) => {
        if (characters.length > 0) {
            return `${characters[0]} 뭔가 한 거 아님?`;
        }
        return '뭔가 있었는데 기억이 안나';
    },

    // === 파싱 ===
    stripLabel: (comment) => {
        return comment.replace(/^\d+[.)\\-]\s*/, '').replace(/^["']|["']$/g, '').trim();
    },

    minCommentLength: 1,     // 한국어: "ㅋ" 같은 1글자도 유효
    maxCommentLength: 100,
    midDensityRange: [5, 30],

    // === 후처리 노이즈 ===
    applyPostNoise: (text) => {
        let result = text;

        // 15% 마침표 제거
        if (Math.random() < 0.15) {
            result = result.replace(/\.$/, '');
        }

        // 8% 끝에 공백 추가 (실수)
        if (Math.random() < 0.08) {
            result += ' ';
        }

        return result;
    },

    // === CJK 토크나이저 ===
    tokenize: (text) => {
        // 한국어: 2-gram으로 분리 (형태소 분석 없이)
        const tokens: string[] = [];
        for (let i = 0; i < text.length - 1; i++) {
            tokens.push(text.substring(i, i + 2));
        }
        return tokens;
    },

    // === Curator 프롬프트 ===
    curatorPrompt: (commentList, targetCount) => `너는 카카오페이지에서 5년째 소설 읽는 사람이야. 댓글 빨리 훑어.

누군가 봇 만들었어. 네 일: 진짜 같은 댓글을 골라.

분석하지 마. 규칙 생각하지 마.
그냥 "이거 실제 댓글란에서 봤으면 '봇이다' 라고 생각했을까?" 만 판단해.

카카오페이지 독자는 지저분해. 똑똑한 사람도 있고 아닌 사람도 있고.
"ㅋㅋ" 찍고 나가는 사람도 있어.

${targetCount}개 골라.

${commentList}

JSON만:
{ "selected": [indices] }`,
};

export default koLangPack;
