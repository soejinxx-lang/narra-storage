import os
from openai import OpenAI
from translation_core.paragraph_rhythm_base import mark_break_candidates

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o-mini"  # Cost optimization

# ===============================
# 중국어 웹소설 문단 리듬 전용 프롬프트
# ===============================
PARAGRAPH_RHYTHM_PROMPT_ZH = """
🔴 TASK: Chinese Web Novel Paragraph & Line Break Adjustment

You are adjusting BOTH paragraph breaks AND line breaks for Chinese web novel text.
This is NOT translation. Do NOT change wording, grammar, or content.
Your task: Insert line breaks (`\\n`) and paragraph breaks (`\\n\\n`) for optimal mobile reading.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers as suggestions.
- You MAY use [[BREAK]] → `\\n\\n` (paragraph break)
- You MAY ignore [[BREAK]]
- Remove ALL [[BREAK]] markers in output

🎯 CHINESE WEB NOVEL STANDARDS (起点, 纵横, 晋江)

**核心原则: 极短段落**
- 中文网文段落比其他语言更短
- 手机屏幕1-2行为佳
- 长段落 = 读者流失

📖 LINE BREAK RULES (`\\n` - single line break)

Use `\\n` (NOT `\\n\\n`) between sentences in these cases:

1. **连续叙述 (Continuous narration)**
   ```
   他缓缓抬起头。
   窗外正下着雨。
   ```

2. **短句连接 (Short sentence chains)**
   ```
   心跳加速。
   越来越快。
   越来越猛。
   ```

3. **动作描写 (Action sequences)**
   ```
   门开了。
   走廊一片漆黑。
   传来脚步声。
   ```

4. **内心活动 (Internal thoughts - connected)**
   ```
   这是怎么回事？
   这不可能是真的。
   ```

📖 PARAGRAPH BREAK RULES (`\\n\\n` - blank line)

Use `\\n\\n` (blank line) in these cases:

1. **对话 (Dialogue with "...")**
   - ALWAYS standalone paragraph
   - ALWAYS `\\n\\n` before and after
   ```
   他轻声问道。
   
   "你还好吗？"
   
   她无言地点了点头。
   ```

2. **场景转换 (Scene transition)**
   ```
   他关上了门。
   
   第二天清晨，天色阴沉。
   ```

3. **情绪转变 (Emotional shift)**
   ```
   她笑了。
   
   但眼泪却流了下来。
   ```

4. **视角变化 (POV change)**
   ```
   他头也不回地走了。
   
   她望着他消失在人群中。
   ```

⚡ ULTRA-AGGRESSIVE SPLITTING REQUIRED

Chinese web novels use VERY short paragraphs:
- 1 sentence per paragraph (ideal)
- 2 sentences (maximum)
- 3+ sentences = MUST SPLIT

**Default rule:** After EVERY sentence, consider `\\n\\n`

✅ GOOD EXAMPLE:
```
第二天早晨来得太快。

早上七点整，一辆白色奔驰面包车停在了门外。

"艾拉·普特里女士？"

她只能点头。
心跳如鼓。

这真的在发生吗？
```

❌ BAD EXAMPLE:
```
第二天早晨来得太快。早上七点整，一辆白色奔驰面包车停在了门外。"艾拉·普特里女士？"她只能点头。心跳如鼓。这真的在发生吗？
```

🔍 CHINESE-SPECIFIC RULES:

1. **一句一段为常态 (One sentence = one paragraph is normal)**
   - 中文网文比日文更短
   - 句号（。）后通常换段

2. **对话处理 (Dialogue handling)**
   - 引号内容必须独立成段
   - 对话标签可独立也可连接

3. **心理描写 (Internal monologue)**
   - 短思考用 `\\n` 连接
   - 长思考用 `\\n\\n` 分隔

4. **描写 vs 动作 (Description vs. Action)**
   - 描写: 1-2句后分段
   - 动作: 每句分段

🔍 FINAL CHECK:
- 手机屏幕上是否舒适？
- 有无3句以上段落？（有则SPLIT）
- 对话是否独立？
- 节奏是否够快？

OUTPUT:
- ONLY the adjusted Chinese text
- Use `\\n` for line breaks
- Use `\\n\\n` for paragraph breaks
- NO explanations, NO comments
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
