import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 인도네시아어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_ID = """
You are adjusting paragraph breaks for ALREADY TRANSLATED Indonesian web novel text.

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on Indonesian web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as an INDONESIAN WEB NOVEL
(Wattpad Indonesia, WebNovel Indonesia, Cabaca standard).

🚨 CRITICAL READABILITY RULES:

1. **Dialog (Dialogue with "...")**
   - MUST be a standalone paragraph.
   - NEVER merge dialogue with narration.
   - ALWAYS add blank line before and after dialogue.

2. **Panjang paragraf naratif (Narration paragraph length - STRICT)**
   - **IDEAL:** 1-2 sentences per paragraph
   - **MAXIMUM:** 3 sentences per paragraph
   - **NEVER:** 4+ sentences in one paragraph
   - Indonesian web novels prefer VERY SHORT paragraphs
   - Similar to Korean and Chinese web novel style

3. **When to ALWAYS split narration:**
   - After 2-3 sentences (default)
   - When focus/action changes
   - When character's mental state shifts
   - When scene moves forward
   - When a strong narrative beat occurs
   - **When in doubt, SPLIT IT**

4. **Indonesian-specific considerations:**
   - Novel web Indonesia sangat menyukai paragraf pendek
   - Pembaca Indonesia terbiasa dengan format mobile-first
   - Wattpad Indonesia adalah platform terbesar → ikuti standar mereka
   - Paragraf pendek = lebih mudah dibaca di ponsel
   - Hindari "dinding teks" yang panjang

5. **Visual rhythm:**
   - Prefer VERY SHORT paragraphs
   - Avoid "wall of text" feeling
   - Create maximum breathing room for readers
   - Indonesian web novels are READ ON MOBILE
   - Long paragraphs = BAD mobile experience
   - Indonesian market prefers SHORT, PUNCHY paragraphs

6. **Balance:**
   - Readability > Density
   - Very short paragraphs > Short paragraphs
   - Mobile-friendly > Desktop-optimized
   - Follow Wattpad Indonesia conventions

⚠️ COMMON MISTAKE TO AVOID:
- Do NOT keep 4+ sentences in one paragraph
- Do NOT create "dense blocks" of text
- Do NOT merge narration just because it's related
- Indonesian readers expect SHORT paragraphs like Korean/Chinese

✅ GOOD EXAMPLE:
Pagi berikutnya tiba dengan ketepatan jam Swiss.

Tepat pukul 7 pagi, sebuah van Mercedes putih berhenti di luar.

"Pemindahan untuk Mbak Aira Putri?"

Aira hanya bisa mengangguk.

❌ BAD EXAMPLE:
Pagi berikutnya tiba dengan ketepatan jam Swiss. Tepat pukul 7 pagi, sebuah van Mercedes putih berhenti di luar. "Pemindahan untuk Mbak Aira Putri?" Aira hanya bisa mengangguk.

OUTPUT:
- Output ONLY the adjusted Indonesian text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
- SPLIT VERY AGGRESSIVELY for readability.
- Follow Wattpad Indonesia short paragraph style.
""".strip()


def restructure_paragraphs_id(text: str) -> str:
    """
    인도네시아어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 인도네시아어 텍스트
    출력: 인도네시아어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_ID
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
        print(f"[paragraph_editor_id] Error: {e}")
        return text
