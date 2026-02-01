import os
import sys
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o-mini"  # Cost optimization

# ===============================
# 한국어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_KO = """
🔴 TASK: Korean Web Novel Paragraph & Line Break Adjustment

You are adjusting BOTH paragraph breaks AND line breaks for Korean web novel text.
This is NOT translation. Do NOT change wording, grammar, or content.
Your task: Insert line breaks (`\\n`) and paragraph breaks (`\\n\\n`) for optimal mobile reading.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers as suggestions.
- You MAY use [[BREAK]] → `\\n\\n` (paragraph break)
- You MAY ignore [[BREAK]]
- Remove ALL [[BREAK]] markers in output

🎯 KOREAN WEB NOVEL STANDARDS (Naver Series, Kakao Page)

**핵심 원칙: 모바일 독서 최적화**
- 한 화면에 2-3줄만 보이도록
- 빠른 스크롤, 빠른 호흡
- 긴 문단 = 독자 이탈

📖 LINE BREAK RULES (`\\n` - single line break)

Use `\\n` (NOT `\\n\\n`) between sentences in these cases:

1. **연속 서술 (Continuous narration)**
   ```
   그는 천천히 고개를 들었다.
   창밖으로 비가 내리고 있었다.
   ```

2. **짧은 문장 연결 (Short sentence chains)**
   ```
   심장이 뛰었다.
   빠르게.
   거칠게.
   ```

3. **행동 묘사 (Action sequences)**
   ```
   문을 열었다.
   복도는 어두웠다.
   발소리가 들렸다.
   ```

📖 PARAGRAPH BREAK RULES (`\\n\\n` - blank line)

Use `\\n\\n` (blank line) in these cases:

1. **대사 (Dialogue)**
   - ALWAYS standalone paragraph
   - ALWAYS `\\n\\n` before and after
   ```
   그가 물었다.
   
   "괜찮아?"
   
   아이라는 고개를 끄덕였다.
   ```

2. **장면 전환 (Scene transition)**
   ```
   그는 문을 닫았다.
   
   다음 날 아침.
   ```

3. **감정 전환 (Emotional shift)**
   ```
   그녀는 웃었다.
   
   하지만 눈물이 났다.
   ```

4. **시점 변화 (POV change)**
   ```
   그는 떠났다.
   
   남겨진 그녀는 창밖을 바라보았다.
   ```

⚡ AGGRESSIVE SPLITTING REQUIRED

Korean web novels use VERY short paragraphs:
- 1-2 sentences per paragraph (ideal)
- 3 sentences (maximum)
- 4+ sentences = MUST SPLIT

**Default rule:** After every 2 sentences, consider `\\n\\n`

✅ GOOD EXAMPLE:
```
다음 날 아침이 찾아왔다.
정확히 7시, 흰색 메르세데스 밴이 도착했다.

"아이라 푸트리 씨 이사 맞으신가요?"

아이라는 고개를 끄덕일 수밖에 없었다.
가슴이 두근거렸다.

이게 정말 현실일까?
```

❌ BAD EXAMPLE:
```
다음 날 아침이 찾아왔다. 정확히 7시, 흰색 메르세데스 밴이 도착했다. "아이라 푸트리 씨 이사 맞으신가요?" 아이라는 고개를 끄덕일 수밖에 없었다. 가슴이 두근거렸다. 이게 정말 현실일까?
```

🔍 FINAL CHECK:
- Would this feel fast and light on a phone screen?
- Are there any 4+ sentence blocks? (If yes, SPLIT)
- Does each paragraph fit in 2-3 mobile lines?

OUTPUT:
- ONLY the adjusted Korean text
- Use `\\n` for line breaks
- Use `\\n\\n` for paragraph breaks
- NO explanations, NO comments
""".strip()


def restructure_paragraphs_ko(text: str) -> str:
    """
    한국어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 한국어 텍스트
    출력: 한국어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
    """
    if not text.strip():
        return text
    
    try:
        # 디버깅: 입력 확인
        print(f"[DEBUG-KO] Input length: {len(text)} chars", file=sys.stderr)
        print(f"[DEBUG-KO] Input paragraphs: {text.count(chr(10) + chr(10)) + 1}", file=sys.stderr)
        
        # 1단계: 서사 압력 후보 생성
        text_with_candidates = mark_break_candidates(text)
        print(f"[DEBUG-KO] Break candidates marked: {text_with_candidates.count('[[BREAK]]')}", file=sys.stderr)
        
        # 2단계: LLM이 후보를 보고 최종 판단
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": PARAGRAPH_RHYTHM_PROMPT_KO
                },
                {
                    "role": "user",
                    "content": text_with_candidates
                }
            ],
            temperature=0.3,
        )
        
        result = response.choices[0].message.content.strip()
        
        # 혼재 가능한 [[BREAK]] 마커 제거
        result = result.replace("[[BREAK]]", "").replace("[[BREAK]]\\n", "")
        
        # 디버깅: 출력 확인
        print(f"[DEBUG-KO] Output length: {len(result)} chars", file=sys.stderr)
        print(f"[DEBUG-KO] Output paragraphs: {result.count(chr(10) + chr(10)) + 1}", file=sys.stderr)
        print(f"[DEBUG-KO] Text changed: {text != result}", file=sys.stderr)
        print(f"[DEBUG-KO] First 300 chars changed: {text[:300] != result[:300]}", file=sys.stderr)
        
        return result
    
    except Exception as e:
        # 에러 발생 시 원본 반환
        print(f"[paragraph_editor_ko] Error: {e}", file=sys.stderr)
        return text
