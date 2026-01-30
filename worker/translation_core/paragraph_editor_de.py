import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 독일어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_DE = """
You are adjusting paragraph breaks for ALREADY TRANSLATED German web novel text.

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on German web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as a GERMAN WEB NOVEL
(Wattpad German, WebNovel German standard).

🚨 CRITICAL READABILITY RULES:

1. **Dialog (Dialogue with "..." or „...")**
   - MUST be a standalone paragraph.
   - NEVER merge dialogue with narration.
   - ALWAYS add blank line before and after dialogue.

2. **Länge der Erzählabsätze (Narration paragraph length)**
   - **IDEAL:** 2-3 sentences per paragraph
   - **MAXIMUM:** 4 sentences per paragraph
   - **NEVER:** 5+ sentences in one paragraph
   - German sentences can be VERY long due to compound words
   - But web novels MUST have SHORT paragraphs for mobile reading

3. **When to ALWAYS split narration:**
   - After 2-3 sentences (default - SHORTER than traditional German)
   - When focus/action changes
   - When character's mental state shifts
   - When scene moves forward
   - When a strong narrative beat occurs
   - **When in doubt, SPLIT IT**

4. **German-specific considerations:**
   - Deutsche Webromane bevorzugen kurze Absätze
   - Auch wenn deutsche Sätze lang und komplex sind, müssen Absätze kurz sein
   - Berücksichtigen Sie das mobile Leseerlebnis
   - Zusammengesetzte Wörter machen Sätze länger → Absätze müssen kürzer sein
   - Vermeiden Sie traditionelle deutsche Literaturabsätze

5. **Visual rhythm:**
   - Prefer SHORT paragraphs over long ones
   - Avoid "wall of text" feeling
   - Create breathing room for readers
   - German web novels are READ ON MOBILE
   - Long paragraphs = VERY BAD mobile experience
   - German sentences are already long → paragraphs MUST be short

6. **Balance:**
   - Readability > Density
   - Short paragraphs > Long paragraphs
   - Mobile-friendly > Desktop-optimized
   - Web novel format > Traditional German literary style

⚠️ COMMON MISTAKE TO AVOID:
- Do NOT keep 5+ sentences in one paragraph
- Do NOT create "dense blocks" of text
- Do NOT merge narration just because it's related
- Do NOT follow traditional German literary paragraph conventions
- German sentences are LONG → paragraphs must be EXTRA SHORT

✅ GOOD EXAMPLE:
Der nächste Morgen kam mit der Präzision einer Schweizer Uhr.

Um genau 7 Uhr morgens parkte ein weißer Mercedes-Transporter draußen.

„Umzug für Frau Aira Putri?"

Aira konnte nur nicken.

❌ BAD EXAMPLE:
Der nächste Morgen kam mit der Präzision einer Schweizer Uhr. Um genau 7 Uhr morgens parkte ein weißer Mercedes-Transporter draußen. „Umzug für Frau Aira Putri?" Aira konnte nur nicken.

OUTPUT:
- Output ONLY the adjusted German text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
- SPLIT AGGRESSIVELY for readability.
- German sentences are long → paragraphs MUST be short.
""".strip()


def restructure_paragraphs_de(text: str) -> str:
    """
    독일어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 독일어 텍스트
    출력: 독일어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_DE
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
        print(f"[paragraph_editor_de] Error: {e}")
        return text
