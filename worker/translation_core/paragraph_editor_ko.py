import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 한국어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_KO = """
You are adjusting paragraph breaks for ALREADY TRANSLATED Korean web novel text.

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on Korean web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as a KOREAN WEB NOVEL
(Naver Series, Kakao Page, Munpia, Joara standard).

🚨 CRITICAL READABILITY RULES:

1. **대화 (Dialogue with "...")**
   - MUST be a standalone paragraph.
   - NEVER merge dialogue with narration.
   - ALWAYS add blank line before and after dialogue.

2. **서술 문단 길이 (Narration paragraph length - STRICT)**
   - **IDEAL:** 1-2 sentences per paragraph
   - **MAXIMUM:** 3 sentences per paragraph
   - **NEVER:** 4+ sentences in one paragraph
   - If you see 4+ sentences together, YOU MUST SPLIT THEM.

3. **When to ALWAYS split narration:**
   - After 2-3 sentences (default)
   - When focus/action changes
   - When character's mental state shifts
   - When scene moves forward
   - When a strong narrative beat occurs
   - **When in doubt, SPLIT IT**

4. **Korean-specific considerations:**
   - 한국 웹소설은 매우 짧은 문단을 선호합니다
   - 모바일 환경에서 읽기 편해야 합니다
   - "~했다." 로 끝나는 문장 뒤에는 문단 나누기를 고려하세요
   - 조사와 어미 변화를 고려하여 자연스러운 호흡을 만드세요

5. **Visual rhythm:**
   - Prefer SHORT paragraphs over long ones
   - Avoid "wall of text" feeling
   - Create breathing room for readers
   - Korean web novels are READ ON MOBILE
   - Long paragraphs = BAD mobile experience

6. **Balance:**
   - Readability > Density
   - Short paragraphs > Long paragraphs
   - Mobile-friendly > Desktop-optimized

⚠️ COMMON MISTAKE TO AVOID:
- Do NOT keep 5-10 sentences in one paragraph
- Do NOT create "dense blocks" of text
- Do NOT merge narration just because it's related

✅ GOOD EXAMPLE:
다음 날 아침이 찾아왔다.

정확히 7시, 흰색 메르세데스 밴이 도착했다.

"아이라 푸트리 씨 이사 맞으신가요?"

아이라는 고개를 끄덕일 수밖에 없었다.

❌ BAD EXAMPLE:
다음 날 아침이 찾아왔다. 정확히 7시, 흰색 메르세데스 밴이 도착했다. "아이라 푸트리 씨 이사 맞으신가요?" 아이라는 고개를 끄덕일 수밖에 없었다.

OUTPUT:
- Output ONLY the adjusted Korean text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
- SPLIT AGGRESSIVELY for readability.
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
        # 1단계: 서사 압력 후보 생성
        text_with_candidates = mark_break_candidates(text)
        
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
        
        return result
    
    except Exception as e:
        # 에러 발생 시 원본 반환
        print(f"[paragraph_editor_ko] Error: {e}")
        return text
