import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 스페인어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_ES = """
🔴 TASK: Spanish Web Novel Paragraph & Line Break Adjustment

You are adjusting BOTH paragraph breaks AND line breaks for Spanish web novel text.
This is NOT translation. Do NOT change wording, grammar, or content.
Your task: Insert line breaks (`\\n`) and paragraph breaks (`\\n\\n`) for optimal mobile reading.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers as suggestions.
- You MAY use [[BREAK]] → `\\n\\n` (paragraph break)
- You MAY ignore [[BREAK]]
- Remove ALL [[BREAK]] markers in output

🎯 SPANISH WEB NOVEL STANDARDS (Wattpad Spanish, WebNovel)

**Principio central: Párrafos cortos para móviles**
- Ritmo rápido, fácil de leer
- Párrafos cortos = mejor engagement

📖 LINE BREAK RULES (`\\n` - single line break)

Use `\\n` between sentences for:
1. Continuous narration
2. Short sentence chains
3. Action sequences
4. Connected thoughts

📖 PARAGRAPH BREAK RULES (`\\n\\n` - blank line)

Use `\\n\\n` for:
1. **Diálogo** - ALWAYS standalone
2. Scene transitions
3. Emotional shifts
4. POV changes

⚡ AGGRESSIVE SPLITTING

- 1-2 sentences per paragraph (ideal)
- 3 sentences (maximum)
- 4+ sentences = MUST SPLIT

OUTPUT:
- ONLY adjusted Spanish text
- Use `\\n` for line breaks
- Use `\\n\\n` for paragraph breaks
- NO explanations
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
