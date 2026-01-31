import os
import sys
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 영어 웹소설 문단 리듬 전용 프롬프트 (with BREAK candidates)
# ===============================
PARAGRAPH_RHYTHM_PROMPT_EN = """
🔴 TASK: English Web Novel Paragraph Rhythm Adjustment
You are NOT translating. You are NOT rewriting. You are NOT summarizing.
You are adjusting paragraph breaks only for ENGLISH WEB NOVELS.

🔒 ABSOLUTE RULES (DO NOT VIOLATE)
* Do NOT change wording, grammar, tense, or vocabulary.
* Do NOT add or remove sentences.
* Do NOT merge or split sentences.
* Do NOT paraphrase.
* You may ONLY insert or remove line breaks (`\\n\\n`).

If you change meaning in any way, the task is failed.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on English web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

📖 CONTEXT: ENGLISH WEB NOVEL STYLE
This text is for mobile/web novel readers, NOT traditional literature.

Key principle:
Paragraph breaks are based on reader breathing and eye movement, NOT logic, grammar, or academic structure.

If sentences feel "stuck together", the paragraphing is wrong.

✅ PARAGRAPH RHYTHM RULES (VERY IMPORTANT)
Apply the following strictly:

1. Dialogue
   * Every spoken line MUST be its own paragraph.
   * Never merge dialogue with narration.

2. Inner thoughts / reactions
   * One-sentence paragraphs are ALLOWED and ENCOURAGED.
   * Especially for:
      * fear
      * surprise
      * realization
      * hesitation
      * emotional response

3. Narration
   * Default: 1–2 sentences per paragraph
   * 3 sentences MAXIMUM (only for continuous description)
   * 4 sentences in one paragraph is NOT allowed.

4. Transition moments
   Insert a paragraph break when:
   * emotional state shifts
   * point of view focus shifts
   * tension changes
   * action → reaction
   * description → thought

5. Pacing priority
   When unsure:
   * SHORTER paragraphs are always better than longer ones.
   * If it feels even slightly dense → split it.

❌ WHAT NOT TO DO (CRITICAL)
* Do NOT group sentences just because they are logically related.
* Do NOT create "essay-style" paragraphs.
* Do NOT aim for literary density.
* Do NOT imitate printed novels.

If a paragraph looks like a solid block of text, it is WRONG.

✅ OUTPUT FORMAT
* Output ONLY the adjusted text.
* Use blank lines to separate paragraphs.
* No explanations.
* No comments.
* No markdown.

🧠 FINAL CHECK BEFORE OUTPUT
Ask yourself silently:
"Would this feel fast, light, and easy to read on a phone screen?"

If the answer is no, add more paragraph breaks.
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
