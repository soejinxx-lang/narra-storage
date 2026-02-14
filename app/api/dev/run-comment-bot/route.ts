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

/**
 * 댓글 생태계 필터 v4: 과생성 → 점수 선택 → 분포 보장 → 노이즈
 * 20개 과생성 → 세트 분포 점수 → 타입별 최소 보장 → 후처리 왜곡
 */
function filterStructuralDiversity(comments: string[], targetCount: number = 8): string[] {
    const abstractNouns = ['관계', '심리', '마음', '의미', '감정', '순간', '시작', '존재', '가치'];

    // ========== 1단계: 개별 점수 + 타입 분류 ==========
    type CommentType = 'ultra-short' | 'question' | 'fragment' | 'emotion' | 'general';

    const scored = comments.map(comment => {
        const cleaned = comment.replace(/\.$/g, '').trim();
        let score = 50;

        // 감점
        if (/[가-힣]+의\s*[가-힣]+[이가은는을를]/.test(cleaned)) score -= 15;
        const abstractCount = abstractNouns.filter(n => cleaned.includes(n)).length;
        score -= abstractCount * 10;
        if (/[가-힣]+[이가]\s*[가-힣]+(다|해|네|음|져|워)/.test(cleaned)) score -= 10;
        if (cleaned.length >= 10 && cleaned.length <= 15) score -= 5;

        // 가점
        if (cleaned.length <= 5) score += 20;
        if (cleaned.includes('?') || /[뭐왜뭔어떻]/.test(cleaned)) score += 15;
        if (cleaned.includes('…') || cleaned.includes('..')) score += 10;
        if (/[ㅋㅠㄷ]{2,}/.test(cleaned)) score += 10;
        if (/[ㅁㅊㄹㅇㅂㅅㅎ]{2,}/.test(cleaned)) score += 15;

        // 타입 분류
        let type: CommentType;
        if (cleaned.length <= 5) type = 'ultra-short';
        else if (cleaned.includes('?') || /[뭐왜뭔어떻]/.test(cleaned)) type = 'question';
        else if (cleaned.includes('…') || cleaned.includes('..') || cleaned.length <= 10) type = 'fragment';
        else if (/[ㅋㅠㄷ]{2,}/.test(cleaned)) type = 'emotion';
        else type = 'general';

        return { text: cleaned, score, type };
    });

    // ========== 2단계: 세트 단위 중복 구조 감점 ==========
    // "~의" 과다
    const possessiveCount = scored.filter(s => s.text.includes('의 ')).length;
    if (possessiveCount >= 3) {
        let downgraded = 0;
        for (const s of scored) {
            if (s.text.includes('의 ') && downgraded < possessiveCount - 2) {
                s.score -= 20;
                downgraded++;
            }
        }
    }

    // "~네" 과다
    const neCount = scored.filter(s => s.text.endsWith('네') || s.text.endsWith('네ㅋㅋ')).length;
    if (neCount >= 4) {
        let downgraded = 0;
        for (const s of scored) {
            if ((s.text.endsWith('네') || s.text.endsWith('네ㅋㅋ')) && downgraded < neCount - 3) {
                s.score -= 15;
                downgraded++;
            }
        }
    }

    // 길이 균일성 감점 (평균 ±2자 범위에 5개 이상)
    const avgLen = scored.reduce((sum, s) => sum + s.text.length, 0) / scored.length;
    const uniformCount = scored.filter(s => Math.abs(s.text.length - avgLen) <= 2).length;
    if (uniformCount >= 5) {
        let downgraded = 0;
        for (const s of scored) {
            if (Math.abs(s.text.length - avgLen) <= 2 && downgraded < uniformCount - 4) {
                s.score -= 10;
                downgraded++;
            }
        }
    }

    // ========== 3단계: 분포 보장 선택 ==========
    scored.sort((a, b) => b.score - a.score);

    const selected: typeof scored = [];
    const minQuotas: Record<CommentType, number> = {
        'ultra-short': 2, 'question': 2, 'fragment': 1, 'emotion': 1, 'general': 0
    };

    // 먼저 각 타입별 최소 보장 (점수 높은 순)
    for (const [type, min] of Object.entries(minQuotas)) {
        const candidates = scored.filter(s => s.type === type && !selected.includes(s));
        const picks = candidates.slice(0, min);
        selected.push(...picks);
    }

    // 나머지는 점수순으로 채우기
    for (const item of scored) {
        if (selected.length >= targetCount) break;
        if (!selected.includes(item)) {
            selected.push(item);
        }
    }

    // 드랍 로그
    const dropped = scored.filter(s => !selected.includes(s));
    for (const d of dropped) {
        console.log(`🔪 Scored out (${d.score}점, ${d.type}): "${d.text}"`);
    }

    // ========== 4단계: 후처리 왜곡 (노이즈 삽입) ==========
    const noised = selected.map(item => {
        let text = item.text;

        // 10% 확률: 마지막 단어 삭제 (파편화)
        if (Math.random() < 0.1 && text.length > 5) {
            const words = text.split(' ');
            if (words.length >= 2) {
                text = words.slice(0, -1).join(' ');
            }
        }

        // 10% 확률: ㅋㅋ 과잉 삽입
        if (Math.random() < 0.1 && !text.includes('ㅋ')) {
            text += 'ㅋㅋ';
        }

        return text;
    });

    // 순서 셔플 (인접 교환)
    for (let i = noised.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        if (Math.abs(i - j) <= 2) {
            [noised[i], noised[j]] = [noised[j], noised[i]];
        }
    }

    const typeDistribution = selected.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    console.log(`📊 Final: ${noised.length}/${comments.length}, types: ${JSON.stringify(typeDistribution)}`);
    return noised;
}

async function generateDeepContextComments(
    episodeContent: string,
    count: number = 8
): Promise<{ comments: string[]; detectedTags: string[] }> {
    const trimmed = episodeContent.length > 2000
        ? episodeContent.slice(-2000)
        : episodeContent;

    // ========== 공통 규칙 (금지 3개만) ==========
    const commonRules = `[공통 규칙]
- "~의 ~이/가" 조사 중첩 금지
- 추상어(관계, 심리, 마음, 의미, 감정, 순간) 2개 이상 금지
- 마침표 쓰지 마. 이모지 쓰지 마
- 감상문처럼 보이면 실패다. 설명하려 하지 말고 즉각 반응처럼 써라`;

    // ========== 역할별 분리 생성 ==========

    // 1️⃣ 태그 + 극초단문 (6개 과생성)
    const shortPrompt = `너는 한국 웹소설 독자야. 방금 이 에피소드를 읽었어.

[역할] 5자 이하 극초단문 반응만 생성. 전부 다르게.
[필수] 가장 꽂힌 장면 1개를 골라서 즉각 반응

${commonRules}

[출력 — 반드시 JSON]
{
  "tags": ["battle/romance/betrayal/cliffhanger/comedy/powerup/death/reunion 중 해당하는 것만"],
  "comments": ["극초단문 6개. 전부 다른 구조로"]
}

[예시]
미침
ㅋㅋㅋㅋ
ㄷㄷ
뭐임
헐
ㅁㅊ
ㄹㅇ

[에피소드 본문]
${trimmed}`;

    // 2️⃣ 의문형 + 파편형 (8개 과생성)
    const fragmentPrompt = `너는 한국 웹소설 독자야. 방금 이 에피소드를 읽었어.

[역할] 끊긴 문장, 의문형 반응만 생성. 완결된 문장 금지. 전부 다른 구조로.
[필수] 장면 속 행동/대사/상황을 직접 언급

${commonRules}

[출력 — 반드시 JSON]
{
  "comments": ["의문형/파편형 8개. 같은 패턴 반복 금지"]
}

[예시]
에른스트 왜 저래?
거기서 칼 빼네
아니 그걸 왜 지금
카일 결단 뭐냐
저기서 뛰어내린다고?
리나 저건 좀…

[에피소드 본문]
${trimmed}`;

    // 3️⃣ 감정폭발 + 일반 (6개 과생성)
    const emotionPrompt = `너는 한국 웹소설 독자야. 방금 이 에피소드를 읽었어.

[역할] 감정 폭발 3개 + 일반 단문 3개 생성. 전부 다른 톤으로.
[필수] 감정 폭발은 ㅋㅋ/ㅠㅠ 포함, 일반은 장면 단서 포함

${commonRules}

[출력 — 반드시 JSON]
{
  "comments": ["감정폭발 3개 + 일반단문 3개. 전부 다르게"]
}

[예시]
아니 ㅋㅋㅋㅋㅋ 미쳤냐
소름이다 진짜
웃다가 우는거 뛰임
와 잠깐만ㅋㅋㅋㅋ

[에피소드 본문]
${trimmed}`;

    // ========== 병렬 호출 ==========
    console.log('🧠 Split generation: 3 specialized calls...');
    const [shortRaw, fragmentRaw, emotionRaw] = await Promise.all([
        callAzureGPT(shortPrompt),
        callAzureGPT(fragmentPrompt),
        callAzureGPT(emotionPrompt)
    ]);

    // ========== 결과 합치기 ==========
    const allComments: string[] = [];
    let detectedTags: string[] = [];

    const parseComments = (raw: string | null): string[] => {
        if (!raw) return [];
        const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed.tags) {
                detectedTags = (parsed.tags || []).filter((t: string) =>
                    ['battle', 'romance', 'betrayal', 'cliffhanger', 'comedy', 'powerup', 'death', 'reunion'].includes(t)
                );
            }
            return (parsed.comments || [])
                .map((c: string) => c.replace(/^["']|["']$/g, '').trim())
                .filter((c: string) => c.length > 0 && c.length < 100);
        } catch {
            return raw.split('\n')
                .map(l => l.replace(/^\d+[\.)\\-]\s*/, '').replace(/^"|"$/g, '').trim())
                .filter(l => l.length > 0 && l.length < 100);
        }
    };

    allComments.push(...parseComments(shortRaw));
    allComments.push(...parseComments(fragmentRaw));
    allComments.push(...parseComments(emotionRaw));

    // 점수 기반 필터 적용
    const filtered = filterStructuralDiversity(allComments);

    console.log(`🧠 Split result: ${allComments.length} raw → ${filtered.length} filtered, tags: [${detectedTags.join(', ')}]`);
    return { comments: filtered, detectedTags };
}

// ============================================================
// 하위 장르 → 상위 카테고리 매핑 (4-Tier Taxonomy)
// ============================================================

const GENRE_CATEGORY_MAP: Record<string, string> = {
    // Fantasy → game-fantasy
    'GameLit / LitRPG': 'game-fantasy',
    'Progression': 'game-fantasy',
    'Cultivation': 'game-fantasy',
    'Dungeon / Tower': 'game-fantasy',

    // Fantasy → murim
    'Murim': 'murim',
    'Martial Arts': 'murim',

    // Romance → romance
    'Contemporary Romance': 'romance',
    'Historical Romance': 'romance',
    'Romantic Fantasy': 'romance',
    'CEO / Billionaire': 'romance',
    'Enemies to Lovers': 'romance',
    'Forbidden Love': 'romance',
    'Omegaverse': 'romance',
    'Paranormal Romance': 'romance',
    'Romantic Comedy': 'romance',

    // Isekai/Regression → regression
    'Isekai': 'regression',
    'Regression': 'regression',
    'Reincarnation': 'regression',
    'Transmigration': 'regression',

    // Sci-Fi → sci-fi
    'Space Opera': 'sci-fi',
    'Cyberpunk': 'sci-fi',
    'Post-Apocalyptic': 'sci-fi',
    'Mecha': 'sci-fi',
    'Virtual Reality': 'sci-fi',
    'Hard Sci-Fi': 'sci-fi',
    'Steampunk': 'sci-fi',

    // Mystery/Thriller → mystery
    'Psychological Thriller': 'mystery',
    'Crime': 'mystery',
    'Detective': 'mystery',
    'Cozy Mystery': 'mystery',
    'Revenge': 'mystery',
    'Espionage': 'mystery',
    'Whodunit': 'mystery',

    // Horror → horror
    'Gothic Horror': 'horror',
    'Supernatural': 'horror',
    'Zombie': 'horror',
    'Survival Horror': 'horror',
    'Body Horror': 'horror',
    'Folk Horror': 'horror',

    // Historical → historical  
    'Period Drama': 'historical',
    'Alternate History': 'historical',
    'Historical Fantasy': 'historical',
    'Court Intrigue': 'historical',
    'War Epic': 'historical',
    'Dynasty': 'historical',

    // Slice of Life / Contemporary → slice-of-life
    'Contemporary': 'slice-of-life',
    'Coming of Age': 'slice-of-life',
    'School Life': 'slice-of-life',
    'Workplace': 'slice-of-life',
    'Family Drama': 'slice-of-life',
    'Tragedy': 'slice-of-life',
    'Melodrama': 'slice-of-life',

    // Action → action
    'Superhero': 'action',
    'Military': 'action',
    'Survival': 'action',
    'Apocalyptic': 'action',
    'Battle Royale': 'action',
    'Sports': 'action',

    // Comedy → comedy
    'Parody': 'comedy',
    'Satire': 'comedy',
    'Slapstick': 'comedy',
    'Dark Comedy': 'comedy',

    // Note: LGBTQ+ moved to Tropes (not genre-specific)
    // Note: Time Travel moved to Narrative Devices (not genre-specific)
};

// ============================================================
// 장르별 × 언어별 GPT 힌트 (Multilingual Genre Hints)
// ============================================================

const GENRE_HINTS: Record<string, Record<string, string>> = {
    'fantasy': {
        'ko': `\n\n[장르: 판타지 | 한국어 댓글 스타일]
- 짧은 문장 (5-15자)
- 쉼표 거의 사용 안 함
- "복선", "설정", "세계관", "각성", "서사" 자주 사용
- 분석 + 감탄 혼합
- 감정 비율: 계산 40%, 감정 30%, 응원 15%, 무의미(ㅋㅋ/출첵) 10%, 비판 5%

예시:
- 복선 회수 ㅁㅊ
- 설정 이거 말 됨?
- 각성 장면 소름
- 진짜 서사 쩔어`,

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
        'ko': `\n\n[장르: 로맨스 | 한국어 댓글 스타일]\n- 짧은 문장, 쉼표 거의 없음\n- ㅠㅠ / ㅋㅋ 많음\n- "각", "레전드", "서브남" 축약어\n- 감정 비율: 감정 폭발 50%, 커플링 논쟁 20%, 비난 15%, 응원 10%\n\n집착 포인트: 남주 태도, 질투 장면, 답답함, 후회각\n행동 패턴: 스킨십 → 댓글 몰림, 질투 장면 → 밀도 3배\n\n예시:\n- 남주 진짜 답답함\n- 저러다 후회각\n- 왜 이제야 고백함\n- 키스각ㅠㅠ`,
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

    'sci-fi': {
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
- 짧음 (초단문 비율 높음)
- "개간지", "체급차", "사이다"
- ㅋㅋ은 긴장 해소
- 감정 비율: 반응 40%, 체급 언급 25%, 전략 15%

집착 포인트: 체급, 사이다, 전략, 설정 합리성
행동 패턴: 전투화 → 댓글 폭증, 주인공 강하면 바로 찬양

예시:
- 개간지
- 체급차 ㅁㅊ
- 사이다네ㅋㅋ
- 전투 연출 좋음
- 저기서 왜 저래`,

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

이 댓글에 대한 짧은 반응(대댓글) 1개만 써줘.

[규칙]
- 5~15자 이내 초단문
- ㅇㅈ, ㄹㅇ, ㅋㅋ, ㅠㅠ 자유
- 원댓글 맥락에 맞춰서
- ~다 어미 금지
- JSON 말고 댓글 텍스트만 출력

예시:
원댓글: "미쳤음ㅋㅋ" → 반응: "ㄹㅇ"
원댓글: "카일 죽을 듯" → 반응: "아니지 살 거야"
원댓글: "전개 개빠름" → 반응: "인정ㅋㅋ"`;

    const raw = await callAzureGPT(prompt);
    if (!raw) return '';

    // GPT 응답 정제
    let reply = raw.trim()
        .replace(/^```.*\n?/i, '')
        .replace(/\n?```.*$/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

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
        const genreCategory = getGenreCategory(genreData);

        console.log(`🌐 Source language: ${sourceLanguage}`);
        if (genreCategory) {
            console.log(`🎭 Genre category: ${genreCategory}`);
        }

        // 4. Deep Context GPT 댓글 사전 생성 (deep=true일 때만)
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

                let calls = 0;
                while (deepComments.length < totalCount && calls < 6) {
                    const result = await generateDeepContextCommentsWithGenre(
                        episodeContent,
                        genreCategory,
                        sourceLanguage, // Use novel's source language
                        15              // count
                    );
                    deepComments.push(...result.comments);
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
