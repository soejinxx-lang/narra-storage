import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 프랑스어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_FR = """
🔴 TASK: French Web Novel Paragraph & Line Break Adjustment

You are adjusting BOTH paragraph breaks AND line breaks for French web novel text.
This is NOT translation. Do NOT change wording, grammar, or content.
Your task: Insert line breaks (`\\n`) and paragraph breaks (`\\n\\n`) for optimal mobile reading.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers as suggestions.
- You MAY use [[BREAK]] → `\\n\\n` (paragraph break)
- You MAY ignore [[BREAK]]
- Remove ALL [[BREAK]] markers in output

🎯 FRENCH WEB NOVEL STANDARDS (Wattpad French, WebNovel)

**Principe central: Paragraphes courts pour mobile**
- Rythme rapide, facile à lire
- Paragraphes courts = meilleur engagement

📖 LINE BREAK RULES (`\\n` - single line break)
Use `\\n` between sentences for continuous narration, action, connected thoughts.

📖 PARAGRAPH BREAK RULES (`\\n\\n` - blank line)
Use `\\n\\n` for: Dialogue (ALWAYS), scene transitions, emotional shifts, POV changes.

⚡ AGGRESSIVE SPLITTING
- 1-2 sentences per paragraph (ideal)
- 3 sentences (maximum)
- 4+ sentences = MUST SPLIT

OUTPUT:
- ONLY adjusted French text
- Use `\\n` for line breaks
- Use `\\n\\n` for paragraph breaks
- NO explanations

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on French web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as a FRENCH WEB NOVEL
(Wattpad French, WebNovel French standard).

🚨 CRITICAL READABILITY RULES:

1. **Dialogue (with « ... » or "...")**
   - MUST be a standalone paragraph.
   - NEVER merge dialogue with narration.
   - ALWAYS add blank line before and after dialogue.

2. **Longueur des paragraphes narratifs (Narration paragraph length)**
   - **IDEAL:** 2-3 sentences per paragraph
   - **MAXIMUM:** 4 sentences per paragraph
   - **NEVER:** 5+ sentences in one paragraph
   - French sentences can be complex and longer
   - But web novels still need SHORT paragraphs for mobile reading

3. **When to ALWAYS split narration:**
   - After 3-4 sentences (default)
   - When focus/action changes
   - When character's mental state shifts
   - When scene moves forward
   - When a strong narrative beat occurs
   - **When in doubt, SPLIT IT**

4. **French-specific considerations:**
   - Les romans web français préfèrent des paragraphes courts
   - Même si les phrases sont complexes, les paragraphes doivent être brefs
   - Considérez le rythme de lecture sur mobile
   - Les dialogues avec guillemets français (« ») doivent être séparés

5. **Visual rhythm:**
   - Prefer SHORT paragraphs over long ones
   - Avoid "wall of text" feeling
   - Create breathing room for readers
   - French web novels are READ ON MOBILE
   - Long paragraphs = BAD mobile experience

6. **Balance:**
   - Readability > Density
   - Short paragraphs > Long paragraphs
   - Mobile-friendly > Desktop-optimized
   - French literary style should NOT dominate web novel format

⚠️ COMMON MISTAKE TO AVOID:
- Do NOT keep 5+ sentences in one paragraph
- Do NOT create "dense blocks" of text
- Do NOT merge narration just because it's related
- Do NOT follow traditional French literary paragraph style
- Web novels are DIFFERENT from traditional literature

✅ GOOD EXAMPLE:
Le lendemain matin arriva avec la précision d'une horloge suisse.

À 7 heures précises, un van Mercedes blanc s'arrêta devant la porte.

« Déménagement pour Mme Aira Putri ? »

Aira ne put que hocher la tête.

❌ BAD EXAMPLE:
Le lendemain matin arriva avec la précision d'une horloge suisse. À 7 heures précises, un van Mercedes blanc s'arrêta devant la porte. « Déménagement pour Mme Aira Putri ? » Aira ne put que hocher la tête.

OUTPUT:
- Output ONLY the adjusted French text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
- SPLIT AGGRESSIVELY for readability.
- Prioritize web novel format over traditional French literary style.
""".strip()


def restructure_paragraphs_fr(text: str) -> str:
    """
    프랑스어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 프랑스어 텍스트
    출력: 프랑스어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_FR
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
        print(f"[paragraph_editor_fr] Error: {e}")
        return text
