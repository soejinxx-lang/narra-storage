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
        // 비명/혼란 (씹덕물)
        '끼에에에에엑!!!!', '?????????????????', '받아라 천마데스비임!!!!!!!!!',
        '끼에에에에에에에에에엥에에에에에에에에에에엑',
        // 감탄사 + 후속
        '와 이건좋네ㅋㅋ', '오 이거괜찮은데?', '와ㅋㅋㅋ', '헐ㄷㄷ',
        '오 좋은데', '와 이건좀', '헐 진짜?', '오 그래?',
        // 반응
        '비추수집기 ㅋㅋ', '이거시 현실', '뼈 한번 부러지고 다시 붙으면 더 단단해진다던데',
        '조별과제가 이렇게 무섭습니다...', '운수좋은 날 각이다',
        '아니 형이 왜 여기서 나와ㅋㅋㅋㅋ 미래가 밝다',
        '저 왜 여기있습니까?', '나 이제 들어가',
        '입컷들을 홀리는 알파메일', '오늘도 사랑한다 압축고라니',
        '참고 본다', '이 댓글 때문이라도 더 읽어봐야겠는걸',
        '정도의 차이만 있지 음습하지 않은 여자가 없는ㅋㅋㅋㅋ',
        '바로 뚝배기 시원하게 깨버리네ㅋㅋㅋㅋ',
        '사제 ㅅㅂ ㅁㅊ ㅋㅋ', '애미창녀ㅋㅋㅋ',
        '역대급이네ㄷㄷ', '카..오랜만에 뽕차네',
        'ㅋㅋ 민심 개급창났노', '아빠한테 인사해ㅋㅋ',
        'nice ㅇㅈ', 'ㅋㅋㅋㅋ', '굿굿ㅋㅋ', 'ㄹㅇㅋㅋ',
        '이건좀 레전드네ㄷㄷ', '출첵', '감사', '여기까지 읽음',
        '??????????', '잘 읽었습니다', '솔직히 끌리잖음?',
        '야 니두?', '덜익은거라고!', '귀곡팔황 생각나네ㅋㅋ',
        // 겜바바 수집
        '하 ㅡ늘 ㅡ치ㅡ!', '와타시가 사키니 스키다타노니',
        '그 뼈가 없어지면 무용지물 아닐까요?',
        '뼈가 없으면 뼈가 부러질 일도 없으니 이득아닐까?',
        '아점...아점이요....', '페도의 길을 걷는...',
        '재밌네ㅋㅋㅋ',
        // 쿠키/결제 관련 (범용)
        '쿠키 아깝다', '돈 내고 볼 레벨',
        '무료분 여기까지?', '잠금화 걸릴때마다 화남',
    ],

    // 20% — 감정 표현
    emotional: [
        '눈물남ㅠ', '눈물남ㅠㅠ', '진짜소름', '소름ㄷㄷ',
        '심장 아파', '미쳤음ㅋㅋ', '아 ㅈㄴ슬프네',
        '이 장면 진짜...', '💔', '가슴이 웅장해진다',
        '아 개웃기네ㅋㅋㅋ', '심장 터질 것 같아', '숨 못 쉬겠어',
        '아 진짜 화나', '개감동ㅠㅠ', '설렌다', '두근두근',
        '아 미치겠네', '진짜 답답해', '이건 못참지', '개쩐다',
        '살려주세요 다음화 무서워서 못보겠어요',
        '크읔..너무 현실적인 이유인 거시에요',
        '밑고있었다고 젠장!', '개약한 캣트라니 믿을 수 없다 아아아아악',
        '1화부터 Ntr냄새가 혹 나서 퇴각하려다가 이 댓글 보고 참기로 했습니다',
        '너 진짜 어디사나 열받네',
        '작가님이 이기셨습니다 / 저는 ㅈㅈ치겠습니다',
        '이제 좀있으면 한달 반이다...', '연재중단ㅠㅠ',
        '와 이건 진짜', '아 개웃겨ㅋㅋㅋㅋㅋ', '심장 뛰어',
        '진심 소름돋음', '미쳤음ㅋㅋ', '헉', '와...', '대박',
    ],

    // 10% — 분석/이론/떡밥
    theorist: [
        '아마 그건 복선인듯', '여기 떡밥 깔린 거 같은데',
        '다음화에 반전 올 듯', '이거 나중에 중요할 듯',
        '혹시 이거...?', '설마 저 캐릭이?', '복선 미쳤다',
        '여기서 복선 회수했네', '앞에 나온 거랑 연결되네',
        '이 설정 ㄹㅇ', '논리 탄탄하네', '개연성 굿',
        '아 그래서 그랬구나', '이제 이해됨', '오 복선 깔았네',
        '나중에 이거 중요할 듯', '이부분 기억해둬야겠다',
        '복선인가?', '떡밥 투척', '복선 회수 개쩔어',
        '설정 좋네', '이 설정 신선한데', '세계관 탄탄',
        '전개 예측불가', '이 전개 누가 예상함?',
        '해독제가 있으면 마약 더 팔지ㅎㅎㅎ',
        '전장에서 최고의 치유는 우리편을 상처 입히는 적군을 없애는것이다!',
        '진정한 힐러의 역할이란 만악의 근원을 제거하는 것.',
        '초반이 제일 잼있음. 주인공이 돈아껴가며 고생하는 모습.',
        '멸족시킨 사람은 나중에 무조건 나오겠군요 기대되요',
        '이전까진 미쳐버린 마법사인가 했는데 마검사냥꾼인가?',
        // 겜바바 수집 — 게임판타지 theorist
        '이 빌드 ㄹㅇ 사기인데', '스탯 배분 잘못한거 아님?',
        '밸런스 패치 먹을듯', '이 스킬 조합이면 보스 녹지 않나',
        '아이템 파밍루트 개쩌는데', '이 던전 공략법 다른데?',
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
        '정주행 시작', '정주행 중', '재밌게 읽었어요',
        '잘 보고 갑니다', '굿굿',
        '이거 믿고 정주행 하고 있는데 정말 재밌네요',
        '우선 글빨 좋아서 감정선 씹상타치라 계속 보는데',
        '정말 1부 초반 개꿀잼이야 진짜ㅜㅜ',
        '1부는 진짜 레전설이었음',
        '작가님 너무너무너무너무너무 맛있어요',
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
// 태그 기반 템플릿 — 장면 유형별 사건 앵커 댓글
// API: ?tags=battle,betrayal,cliffhanger
// ============================================================
const TAG_TEMPLATES: Record<string, string[]> = {
    battle: [
        '전투씬 미쳤음ㅋㅋ', '액션 쩔어', '이번화 전투 개쩔었는데',
        '싸움 장면에서 소름', '때리는장면 시원하네', '전투 연출 ㄹㅇ',
        '아 전투 너무 좋아', '칼싸움 개간지', '전투력 측정 불가ㅋㅋ',
        '이번 배틀 역대급이네', '싸움씬 몰입감 미쳤음', '액션씬 넘 좋다',
    ],
    romance: [
        '둘이 키스할줄', '설렘 폭발ㅠ', '이거 썸인거지?',
        '심쿵사 당했음', '로맨스 개좋아', '이 커플 성사되면 울듯',
        '고백해라 제발', '둘이 눈 마주치는데 심장', '스킨십 나올때 소름',
        '이 장면 설렘 미쳤음', '커플링 확정이지 이거', '연애 전개 좋네',
    ],
    betrayal: [
        '배신각 보였음', '쟤 처음부터 수상했음', '뒤통수 제대로 맞았네',
        '배신 예상했는데 막상 보니까 충격', '이 배신 소름끼치네',
        '그래서 쟤가 그랬구나', '아 배신 ㅈㄴ화남', '믿었는데 배신이라니',
        '쟤 앞에서부터 뭔가 이상했음', '배신 반전 개쩔음',
    ],
    cliffhanger: [
        '여기서 끊어?!', '다음화 존버 시작', '아 여기서 끝이냐고',
        '이게 끝??', '다음화 안보면 미침', '작가 여기서 자름ㅋㅋ',
        '끊는 타이밍 미쳤음', '다음화 기다리다 죽겠다', '이 클리프행어 ㅁㅊ',
        '여기서 끊기?? 진짜??', '아아아 다음화ㅠㅠ',
    ],
    comedy: [
        'ㅋㅋㅋㅋㅋ 미쳐', '이 장면에서 빵터짐', '개웃겨ㅋㅋㅋ진짜',
        '코미디 천재임', '웃겨서 주변 눈치봄', '이거 진심 웃겼음ㅋㅋ',
        '복통옴ㅋㅋㅋ', '아 ㅋㅋ 이건 좀',
    ],
    powerup: [
        '각성 장면 소름', '레벨업 쩐다', '파워업 개간지',
        '여기서 각성하네', '드디어 강해짐', '이 스킬 사기인데',
        '각성씬 연출 미쳤음', '진짜 강해졌네ㅋㅋ',
    ],
    death: [
        '아 죽었어??', '진짜 죽은거야?', '설마 퇴장 아니지',
        '여기서 죽으면 안되는데', '사망 확정이야?', '아 눈물남',
        '제발 살려줘ㅠ', '죽음 연출에 눈물',
    ],
    reunion: [
        '재회 장면에서 울었음', '드디어 만났다ㅠ', '재회씬 소름',
        '기다렸다 이 장면', '아 재회 눈물남ㅠㅠ', '드디어ㅠㅠㅠ',
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

    // 20% 마침표 삭제
    if (Math.random() < 0.20) {
        result = result.replace(/\.$/, '');
    }

    // 15% 마지막 글자 삭제 (단어 경계 고려 — 한글 받침 깨짐 방지)
    if (Math.random() < 0.15 && result.length > 5) {
        // 공백 기준으로 마지막 단어 삭제 (글자 하나 삭제보다 자연스러움)
        const words = result.split(' ');
        if (words.length > 1) {
            result = words.slice(0, -1).join(' ');
        }
        // 단어 1개면 truncation 안 함 (깨짐 방지)
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
    sceneTags: string[] = []
): string {
    // 25% 확률로 태그 기반 장면 템플릿 시도 (태그 있을 때만)
    if (sceneTags.length > 0 && Math.random() < 0.25) {
        // 태그 중 랜덤으로 하나 선택
        const tag = sceneTags[Math.floor(Math.random() * sceneTags.length)];
        const tagPool = TAG_TEMPLATES[tag];
        if (tagPool && tagPool.length > 0) {
            const available = tagPool.filter(t => !usedTemplates.has(t));
            let selected: string;
            if (available.length === 0) {
                selected = tagPool[Math.floor(Math.random() * tagPool.length)];
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
function randomTimestamp(): Date {
    const now = Date.now();
    const rand = Math.random();
    let offset: number;

    if (rand < 0.60) {
        // 60% 최근 24시간
        offset = Math.random() * 24 * 60 * 60 * 1000;
    } else if (rand < 0.85) {
        // 25% 1-3일
        offset = (1 + Math.random() * 2) * 24 * 60 * 60 * 1000;
    } else {
        // 15% 3-7일
        offset = (3 + Math.random() * 4) * 24 * 60 * 60 * 1000;
    }

    return new Date(now - offset);
}

// ============================================================
// Deep Context GPT — Azure OpenAI 호출
// ============================================================
async function callAzureGPT(prompt: string): Promise<string> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview';
    const deployment = 'gpt-4omini';

    if (!endpoint || !apiKey) {
        console.warn('⚠️ Azure OpenAI not configured, skipping deep context');
        return '';
    }

    try {
        const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
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

        if (!response.ok) {
            console.error(`❌ Azure GPT error: ${response.status}`);
            return '';
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    } catch (err) {
        console.error('❌ Azure GPT call failed:', err);
        return '';
    }
}

async function generateDeepContextComments(
    episodeContent: string,
    count: number = 8
): Promise<{ comments: string[]; detectedTags: string[] }> {
    // 본문이 너무 길면 마지막 2000자만 (최근 장면이 더 중요)
    const trimmed = episodeContent.length > 2000
        ? episodeContent.slice(-2000)
        : episodeContent;

    const prompt = `너는 한국 웹소설 독자야. 방금 이 에피소드를 읽었어.

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

    // JSON 파싱 시도
    try {
        const parsed = JSON.parse(raw);
        const comments = (parsed.comments || []).filter((c: string) => c.length > 0 && c.length < 100);
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
        console.log(`🤖 [v2] Starting natural comment bot for ${novelId}...`);

        // 1. 에피소드 ID 조회
        const episodeResult = await db.query(
            `SELECT id FROM episodes WHERE novel_id = $1 ORDER BY ep ASC LIMIT 1`,
            [novelId]
        );

        if (episodeResult.rows.length === 0) {
            return NextResponse.json(
                { error: `No episodes found for ${novelId}` },
                { status: 404 }
            );
        }

        const episodeId = episodeResult.rows[0].id;
        console.log(`✅ Target episode: ${episodeId}`);

        // 1.5. 캐릭터 이름 로딩 (context-required 템플릿용)
        const entityResult = await db.query(
            `SELECT source_text FROM entities WHERE novel_id = $1 AND (category = 'character' OR category IS NULL) LIMIT 20`,
            [novelId]
        );
        const characterNames: string[] = entityResult.rows.map((r: { source_text: string }) => r.source_text);

        // 2. 기존 댓글 캐싱 (규칙 14: 답글 가중치용)
        const existingResult = await db.query(
            `SELECT c.id, 
                    (SELECT COUNT(*) FROM comments c2 WHERE c2.parent_id = c.id) as reply_count
             FROM comments c
             WHERE c.episode_id = $1`,
            [episodeId]
        );
        const commentPool: { id: string; reply_count: number }[] = existingResult.rows.map((r: { id: string; reply_count: string }) => ({
            id: r.id,
            reply_count: parseInt(r.reply_count) || 0,
        }));

        // 3. Deep Context GPT 댓글 사전 생성 (deep=true일 때만)
        let deepComments: string[] = [];
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
                // totalCount만큼 GPT 댓글 확보 (15개씩 배치 호출)
                const batchSize = 15;
                const needed = totalCount;
                let calls = 0;
                while (deepComments.length < needed && calls < 6) { // 최대 6회 호출 제한
                    const result = await generateDeepContextComments(episodeContent, batchSize);
                    deepComments.push(...result.comments);
                    if (calls === 0) sceneTags = result.detectedTags; // 태그는 첫 호출에서만
                    calls++;
                    console.log(`   → 배치 ${calls}: +${result.comments.length}개 (총 ${deepComments.length}/${needed})`);
                }
            } else {
                console.log('⚠️ Episode content too short or null, skipping deep context');
            }
        }

        // 4. 봇 생성 & 댓글 작성
        const usedTemplates = new Set<string>();
        const usedNicknames = new Set<string>();
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
            const username = `bot_${timestamp}_${i}`;

            const userResult = await db.query(
                `INSERT INTO users (username, password_hash, name, is_hidden)
                 VALUES ($1, '', $2, FALSE)
                 RETURNING id`,
                [username, nickname]
            );

            const userId = userResult.rows[0].id;

            // 댓글 작성
            let lastCommentTime: Date | null = null;

            for (let j = 0; j < commentCount && totalCommentsPosted < totalCount; j++) {
                // Deep Context 댓글 (실험: 100% deep 우선, 없으면 템플릿 fallback)
                let content: string;
                if (deepComments.length > 0) {
                    content = deepComments.pop()!;
                    content = humanize(content);
                } else {
                    content = pickComment(tone, usedTemplates, characterNames, sceneTags);
                }
                let createdAt = randomTimestamp();

                // 규칙 10: 같은 봇 댓글 간 5분~3시간 간격
                if (lastCommentTime) {
                    const minGap = 5 * 60 * 1000;
                    const maxGap = 3 * 60 * 60 * 1000;
                    const gap = Math.random() * (maxGap - minGap) + minGap;
                    createdAt = new Date(lastCommentTime.getTime() + gap);
                }
                lastCommentTime = createdAt;

                // 규칙 14: 답글 10% (replyCount 가중치)
                let parentId: string | null = null;
                if (Math.random() < 0.10 && commentPool.length > 0) {
                    const parent = weightedRandom(
                        commentPool.map(c => ({
                            item: c.id,
                            weight: c.reply_count > 0 ? 2.0 : 1.0,
                        }))
                    );
                    parentId = parent;
                }

                const insertResult = await db.query(
                    `INSERT INTO comments (episode_id, user_id, content, parent_id, created_at)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [episodeId, userId, content, parentId, createdAt]
                );

                // 새 댓글을 풀에 추가 (답글 대상)
                commentPool.push({ id: insertResult.rows[0].id, reply_count: 0 });
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
            version: 'v2-natural',
            rules: '15/17 implemented (16=community memes, 17=GPT theorist → future)'
        });

    } catch (error) {
        console.error('Comment Bot Error:', error);
        return NextResponse.json(
            { error: 'Failed to run comment bot', details: String(error) },
            { status: 500 }
        );
    }
}
