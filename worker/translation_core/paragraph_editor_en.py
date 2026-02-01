import os
import sys
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o-mini"  # Cost optimization

# ===============================
# 영어 웹소설 문단 리듬 전용 프롬프트 (with BREAK candidates)
# ===============================
PARAGRAPH_RHYTHM_PROMPT_EN = """
🔴 TASK: English Web Novel Paragraph & Line Break Adjustment

You are adjusting BOTH paragraph breaks AND line breaks for English web novel text.
This is NOT translation. Do NOT change wording, grammar, or content.
Your task: Insert line breaks (`\\n`) and paragraph breaks (`\\n\\n`) for optimal mobile reading.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers as suggestions.
- You MAY use [[BREAK]] → `\\n\\n` (paragraph break)
- You MAY ignore [[BREAK]]
- Remove ALL [[BREAK]] markers in output

🎯 ENGLISH WEB NOVEL STANDARDS (Wattpad, WebNovel, Royal Road)

**Core Principle: Mobile-First Reading**
- Fast scrolling, quick pacing
- Short paragraphs = better engagement
- Long blocks = reader drop-off

📖 LINE BREAK RULES (`\\n` - single line break)

Use `\\n` (NOT `\\n\\n`) between sentences in these cases:

1. **Continuous narration**
   ```
   He slowly lifted his head.
   Rain was falling outside the window.
   ```

2. **Short sentence chains (rhythm/emphasis)**
   ```
   Her heart raced.
   Faster.
   Harder.
   ```

3. **Action sequences**
   ```
   The door opened.
   The hallway was dark.
   Footsteps echoed.
   ```

4. **Internal thoughts (connected)**
   ```
   What was happening?
   This couldn't be real.
   ```

📖 PARAGRAPH BREAK RULES (`\\n\\n` - blank line)

Use `\\n\\n` (blank line) in these cases:

1. **Dialogue**
   - ALWAYS standalone paragraph
   - ALWAYS `\\n\\n` before and after
   ```
   He asked quietly.
   
   "Are you okay?"
   
   She nodded, unable to speak.
   ```

2. **Scene transitions**
   ```
   He closed the door behind him.
   
   The next morning arrived cold and gray.
   ```

3. **Emotional shifts**
   ```
   She smiled.
   
   But tears were streaming down her face.
   ```

4. **POV changes**
   ```
   He walked away without looking back.
   
   She watched him disappear into the crowd.
   ```

5. **Tension breaks**
   ```
   The silence stretched.
   
   Then—a crash from upstairs.
   ```

⚡ AGGRESSIVE SPLITTING REQUIRED

English web novels prefer SHORT paragraphs:
- 1-2 sentences per paragraph (ideal)
- 3 sentences (maximum for description)
- 4+ sentences = MUST SPLIT

**Default rule:** After every 2-3 sentences, consider `\\n\\n`

✅ GOOD EXAMPLE:
```
The next morning came too soon.
At exactly 7 AM, a white Mercedes van pulled up.

"Miss Aira Putri?"

She could only nod.
Her heart was pounding.

Was this really happening?
```

❌ BAD EXAMPLE:
```
The next morning came too soon. At exactly 7 AM, a white Mercedes van pulled up. "Miss Aira Putri?" She could only nod. Her heart was pounding. Was this really happening?
```

🔍 ENGLISH-SPECIFIC RULES:

1. **One-sentence paragraphs are ENCOURAGED**
   - For impact
   - For emphasis
   - For emotional beats

2. **Dialogue tags**
   - Keep with dialogue if short: `"Hello," she said.`
   - Separate if long: 
     ```
     "Hello."
     
     She said it with a smile, but her eyes told a different story.
     ```

3. **Internal monologue**
   - Italics or thoughts = separate paragraph
   - Short reactions = can use `\\n` instead of `\\n\\n`

4. **Description vs. Action**
   - Description: 2-3 sentences max
   - Action: 1-2 sentences, then break

🔍 FINAL CHECK:
- Would this feel fast-paced on a phone screen?
- Are there any 4+ sentence blocks? (If yes, SPLIT)
- Does dialogue stand alone?
- Is there breathing room between beats?

OUTPUT:
- ONLY the adjusted English text
- Use `\\n` for line breaks
- Use `\\n\\n` for paragraph breaks
- NO explanations, NO comments
""".strip()


def restructure_paragraphs_en(text: str) -> str:
    """
    영어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 영어 텍스트
    출력: 영어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
    """
    if not text.strip():
        return text
    
    
    
    try:
        # 디버깅: 입력 확인
        print(f"[DEBUG-EN] Input length: {len(text)} chars", file=sys.stderr)
        print(f"[DEBUG-EN] Input paragraphs: {text.count(chr(10) + chr(10)) + 1}", file=sys.stderr)
        
        # 1단계: 서사 압력 후보 생성
        text_with_candidates = mark_break_candidates(text)
        print(f"[DEBUG-EN] Break candidates marked: {text_with_candidates.count('[[BREAK]]')}", file=sys.stderr)
        
        
        # 2단계: LLM이 후보를 보고 최종 판단
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": PARAGRAPH_RHYTHM_PROMPT_EN
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
        result = result.replace("[[BREAK]]", "").replace("[[BREAK]]\n", "")
        
        # 디버깅: 출력 확인
        print(f"[DEBUG-EN] Output length: {len(result)} chars", file=sys.stderr)
        print(f"[DEBUG-EN] Output paragraphs: {result.count(chr(10) + chr(10)) + 1}", file=sys.stderr)
        print(f"[DEBUG-EN] Text changed: {text != result}", file=sys.stderr)
        print(f"[DEBUG-EN] First 300 chars changed: {text[:300] != result[:300]}", file=sys.stderr)
        
        return result
    
    except Exception as e:
        # 에러 발생 시 원본 반환
        print(f"[paragraph_editor_en] Error: {e}", file=sys.stderr)
        return text
