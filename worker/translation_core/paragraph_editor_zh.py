import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

# ===============================
# 중국어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_ZH = """
You are adjusting paragraph breaks for ALREADY TRANSLATED Chinese web novel text.

This is NOT a translation task.
Do NOT rewrite, summarize, add, remove, or rephrase any content.
You MUST preserve all sentences exactly.
Your ONLY task is to adjust paragraph breaks (line breaks).

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers indicating potential paragraph break points.
These are SUGGESTIONS, not requirements.

- You MAY keep [[BREAK]] as a paragraph break (replace with \\n\\n)
- You MAY ignore [[BREAK]] and keep sentences together
- Use your judgment based on Chinese web novel reading rhythm

**IMPORTANT:** Remove ALL [[BREAK]] markers in your output.
Output should contain ONLY the adjusted text with proper paragraph breaks.

GOAL:
Make the text comfortable to read as a CHINESE WEB NOVEL
(Qidian, Zongheng, 17K standard).

🚨 CRITICAL READABILITY RULES:

1. **对话 (Dialogue with "...")**
   - MUST be a standalone paragraph.
   - NEVER merge dialogue with narration.
   - ALWAYS add blank line before and after dialogue.

2. **叙述段落长度 (Narration paragraph length - VERY STRICT)**
   - **IDEAL:** 1-2 sentences per paragraph
   - **MAXIMUM:** 2 sentences per paragraph
   - **NEVER:** 3+ sentences in one paragraph
   - Chinese web novels prefer VERY SHORT paragraphs
   - If you see 3+ sentences together, YOU MUST SPLIT THEM.

3. **When to ALWAYS split narration:**
   - After 1-2 sentences (default - SHORTER than other languages)
   - When focus/action changes
   - When character's mental state shifts
   - When scene moves forward
   - When a strong narrative beat occurs
   - **When in doubt, SPLIT IT**

4. **Chinese-specific considerations:**
   - 中文网络小说偏好极短的段落
   - 移动阅读环境下，短段落更易读
   - 句号（。）后通常应该换段
   - 避免"文字墙"效果
   - 中文没有空格，所以段落分隔更重要

5. **Visual rhythm:**
   - Prefer VERY SHORT paragraphs
   - Avoid "wall of text" feeling at all costs
   - Create maximum breathing room for readers
   - Chinese web novels are READ ON MOBILE
   - Long paragraphs = VERY BAD mobile experience

6. **Balance:**
   - Readability > Density
   - Very short paragraphs > Short paragraphs
   - Mobile-friendly > Desktop-optimized
   - Chinese web novels are SHORTER than English/Japanese

⚠️ COMMON MISTAKE TO AVOID:
- Do NOT keep 3+ sentences in one paragraph
- Do NOT create "dense blocks" of text
- Do NOT merge narration just because it's related
- Chinese web novels are MORE fragmented than other languages

✅ GOOD EXAMPLE:
第二天早晨准时到来。

早上七点整，一辆白色奔驰面包车停在了门外。

"艾拉·普特里女士的搬家吗？"

艾拉只能点头。

❌ BAD EXAMPLE:
第二天早晨准时到来。早上七点整，一辆白色奔驰面包车停在了门外。"艾拉·普特里女士的搬家吗？"艾拉只能点头。

OUTPUT:
- Output ONLY the adjusted Chinese text.
- Do NOT change sentence order or wording.
- Modify ONLY paragraph breaks.
- SPLIT VERY AGGRESSIVELY for readability.
- Chinese web novels need SHORTER paragraphs than other languages.
""".strip()


def restructure_paragraphs_zh(text: str) -> str:
    """
    중국어 웹소설 문단 리듬 재구성 (2단계)
    
    1단계: [[BREAK]] 후보 생성 (규칙 기반)
    2단계: LLM 판단 (후보 기반)
    
    입력: 번역+편집 완료된 중국어 텍스트
    출력: 중국어 웹소설 독서 리듬에 맞게 줄바꿈만 조정된 텍스트
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
                    "content": PARAGRAPH_RHYTHM_PROMPT_ZH
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
        print(f"[paragraph_editor_zh] Error: {e}")
        return text
