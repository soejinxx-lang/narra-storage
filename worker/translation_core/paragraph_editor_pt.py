import os
from translation_core.openai_client import client
from translation_core.paragraph_rhythm_base import mark_break_candidates


MODEL = "gpt-4omini"  # Azure deployment name

# ===============================
# 포르투갈어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_PT = """
🔴 TASK: Portuguese Web Novel Paragraph & Line Break Adjustment

Adjust BOTH paragraph breaks AND line breaks for Portuguese web novel text.
This is NOT translation. Do NOT change wording.
Task: Insert `\n` (line breaks) and `\n\n` (paragraph breaks) for mobile reading.

📌 BREAK CANDIDATES: [[BREAK]] markers are suggestions. Remove ALL in output.

🎯 PORTUGUESE WEB NOVEL STANDARDS (Wattpad Portuguese, Spirit Fanfics)
- Short paragraphs for mobile
- 1-2 sentences per paragraph (ideal)
- 3 sentences (maximum)
- 4+ sentences = MUST SPLIT

📖 LINE BREAK RULES (`\n`): Use between sentences for continuous narration, action.
📖 PARAGRAPH BREAK RULES (`\n\n`): Use for dialogue (ALWAYS), scene transitions, emotional shifts.


 CRITICAL: PLACEHOLDER PROTECTION
- Text may contain placeholders like __ENTITY_1__, __ENTITY_2__, etc.
- These represent proper nouns (names, places, items)
- NEVER remove, modify, translate, or reformat placeholders
- Keep them EXACTLY as they appear: __ENTITY_X__
- Do NOT change spacing, capitalization, or underscores

OUTPUT: ONLY adjusted Portuguese text. Use `\n` and `\n\n`. NO explanations.
""".strip()


def restructure_paragraphs_pt(text: str) -> str:
    """
    포르투갈어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 포르투갈어 텍스트
    출력: 포르투갈어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_PT
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
        print(f"[paragraph_editor_pt] Error: {e}")
        return text
