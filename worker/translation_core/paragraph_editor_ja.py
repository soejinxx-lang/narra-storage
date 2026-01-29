import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 일본어 웹소설 문단 리듬 전용 프롬프트 (with BREAK candidates)
# ===============================
PARAGRAPH_RHYTHM_PROMPT_JA = """
You are adjusting paragraph breaks for ALREADY TRANSLATED Japanese web novel text.

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on Japanese web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as a GENERAL JAPANESE WEB NOVEL
(Narou / Kakuyomu / commercial web novel standard).

CORE PRINCIPLES:

1. Dialogue
   - Any dialogue using 「」 MUST be a standalone paragraph.
   - Never merge dialogue with narration.

2. Narration paragraph length
   - 1–3 sentences per paragraph is COMMON.
   - 4 sentences may be allowed if they describe the same continuous action or thought.
   - Avoid very long narration paragraphs.

3. When to split narration
   Split paragraphs when:
   - The focus of action changes
   - The character's mental state shifts
   - The scene flow clearly moves forward
   - A strong narrative beat occurs

4. When NOT to split
   - Do NOT split purely because sentences are short.
   - Do NOT enforce one-sentence paragraphs everywhere.
   - Avoid over-fragmentation that disrupts flow.

5. Overall balance
   - Prefer readability and rhythm over density.
   - Japanese web novels generally allow slightly denser paragraphs than English,
     but should not feel visually heavy.

OUTPUT:
- Output ONLY the adjusted Japanese text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
""".strip()


def restructure_paragraphs_ja(text: str) -> str:
    """
    일본어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 일본어 텍스트
    출력: 일본어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_JA
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
        
        
        return result
    
    except Exception as e:
        # 에러 발생 시 원본 반환
        print(f"[paragraph_editor_ja] Error: {e}")
        return text
