import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 스페인어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_ES = """
You are adjusting paragraph breaks for ALREADY TRANSLATED Spanish web novel text.

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on Spanish web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as a SPANISH WEB NOVEL
(Wattpad Spanish, WebNovel Spanish standard).

🚨 CRITICAL READABILITY RULES:

1. **Diálogo (Dialogue with "..." or —)**
   - MUST be a standalone paragraph.
   - NEVER merge dialogue with narration.
   - ALWAYS add blank line before and after dialogue.

2. **Longitud de párrafos narrativos (Narration paragraph length)**
   - **IDEAL:** 2-3 sentences per paragraph
   - **MAXIMUM:** 4 sentences per paragraph
   - **NEVER:** 5+ sentences in one paragraph
   - Spanish sentences tend to be longer than English
   - But web novels still need SHORT paragraphs

3. **When to ALWAYS split narration:**
   - After 3-4 sentences (default)
   - When focus/action changes
   - When character's mental state shifts
   - When scene moves forward
   - When a strong narrative beat occurs
   - **When in doubt, SPLIT IT**

4. **Spanish-specific considerations:**
   - Las novelas web en español prefieren párrafos cortos
   - Aunque las oraciones sean más largas, los párrafos deben ser breves
   - Considere el ritmo de lectura en dispositivos móviles
   - Los diálogos con guiones (—) deben estar separados

5. **Visual rhythm:**
   - Prefer SHORT paragraphs over long ones
   - Avoid "wall of text" feeling
   - Create breathing room for readers
   - Spanish web novels are READ ON MOBILE
   - Long paragraphs = BAD mobile experience

6. **Balance:**
   - Readability > Density
   - Short paragraphs > Long paragraphs
   - Mobile-friendly > Desktop-optimized

⚠️ COMMON MISTAKE TO AVOID:
- Do NOT keep 5+ sentences in one paragraph
- Do NOT create "dense blocks" of text
- Do NOT merge narration just because it's related
- Spanish sentences are longer, but paragraphs should still be short

✅ GOOD EXAMPLE:
La mañana siguiente llegó con la precisión de un reloj suizo.

A las 7 AM en punto, una furgoneta Mercedes blanca se detuvo afuera.

"¿Mudanza para la Sra. Aira Putri?"

Aira solo pudo asentir.

❌ BAD EXAMPLE:
La mañana siguiente llegó con la precisión de un reloj suizo. A las 7 AM en punto, una furgoneta Mercedes blanca se detuvo afuera. "¿Mudanza para la Sra. Aira Putri?" Aira solo pudo asentir.

OUTPUT:
- Output ONLY the adjusted Spanish text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
- SPLIT AGGRESSIVELY for readability.
""".strip()


def restructure_paragraphs_es(text: str) -> str:
    """
    스페인어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 스페인어 텍스트
    출력: 스페인어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_ES
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
        print(f"[paragraph_editor_es] Error: {e}")
        return text
