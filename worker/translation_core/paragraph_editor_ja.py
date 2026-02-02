import os
from translation_core.openai_client import client
from translation_core.paragraph_rhythm_base import mark_break_candidates


MODEL = "gpt-4o-mini"  # Cost optimization

# ===============================
# 일본어 웹소설 문단 리듬 전용 프롬프트 (with BREAK candidates)
# ===============================
PARAGRAPH_RHYTHM_PROMPT_JA = """
🔴 TASK: Japanese Web Novel Paragraph & Line Break Adjustment

You are adjusting BOTH paragraph breaks AND line breaks for Japanese web novel text.
This is NOT translation. Do NOT change wording, grammar, or content.
Your task: Insert line breaks (`\\n`) and paragraph breaks (`\\n\\n`) for optimal mobile reading.

📌 BREAK CANDIDATES
The text contains [[BREAK]] markers as suggestions.
- You MAY use [[BREAK]] → `\\n\\n` (paragraph break)
- You MAY ignore [[BREAK]]
- Remove ALL [[BREAK]] markers in output

🎯 JAPANESE WEB NOVEL STANDARDS (小説家になろう, カクヨム)

**核心原則: 超短文段落**
- 日本のWeb小説は世界で最も短い段落を使用
- モバイル画面で1-2行のみ
- 長い段落 = 読者離脱

📖 LINE BREAK RULES (`\\n` - single line break)

Use `\\n` (NOT `\\n\\n`) between sentences in these cases:

1. **連続描写 (Continuous description)**
   ```
   彼はゆっくりと顔を上げた。
   窓の外では雨が降っていた。
   ```

2. **短文連鎖 (Short sentence chains)**
   ```
   心臓が跳ねた。
   速く。
   激しく。
   ```

3. **アクションシーケンス (Action sequences)**
   ```
   ドアが開いた。
   廊下は暗かった。
   足音が聞こえた。
   ```

4. **内心描写 (Internal thoughts - connected)**
   ```
   どうなっているんだ？
   これは現実じゃない。
   ```

📖 PARAGRAPH BREAK RULES (`\\n\\n` - blank line)

Use `\\n\\n` (blank line) in these cases:

1. **会話 (Dialogue with 「」)**
   - ALWAYS standalone paragraph
   - ALWAYS `\\n\\n` before and after
   ```
   彼は静かに尋ねた。
   
   「大丈夫？」
   
   彼女は言葉もなく頷いた。
   ```

2. **場面転換 (Scene transition)**
   ```
   彼はドアを閉めた。
   
   翌朝、冷たい灰色の朝が訪れた。
   ```

3. **感情の変化 (Emotional shift)**
   ```
   彼女は微笑んだ。
   
   しかし涙が頬を伝っていた。
   ```

4. **視点の変化 (POV change)**
   ```
   彼は振り返らずに歩き去った。
   
   彼女は人混みに消えていく彼を見つめた。
   ```

⚡ ULTRA-AGGRESSIVE SPLITTING REQUIRED

Japanese web novels use THE SHORTEST paragraphs:
- 1 sentence per paragraph (most common)
- 2 sentences (acceptable)
- 3+ sentences = MUST SPLIT

**Default rule:** After EVERY sentence, consider `\\n\\n`

✅ GOOD EXAMPLE:
```
翌朝は早すぎた。

午前7時ちょうど、白いメルセデスのバンが到着した。

「アイラ・プトリさんですか？」

彼女は頷くしかなかった。
心臓が激しく鼓動していた。

これは本当に起こっているのか？
```

❌ BAD EXAMPLE:
```
翌朝は早すぎた。午前7時ちょうど、白いメルセデスのバンが到着した。「アイラ・プトリさんですか？」彼女は頷くしかなかった。心臓が激しく鼓動していた。これは本当に起こっているのか？
```

🔍 JAPANESE-SPECIFIC RULES:

1. **一文一段落が基本 (One sentence = one paragraph is standard)**
   - なろう系では超短文が好まれる
   - 読者の目が疲れない

2. **会話の扱い (Dialogue handling)**
   - 「」は必ず独立段落
   - 会話タグも別段落にすることが多い

3. **心理描写 (Internal monologue)**
   - 短い思考は `\\n` で繋ぐ
   - 長い思考は `\\n\\n` で分ける

4. **描写 vs アクション (Description vs. Action)**
   - 描写: 1-2文で区切る
   - アクション: 1文ごとに区切る

🔍 FINAL CHECK:
- スマホ画面で快適に読めるか？
- 3文以上の段落はないか？（あればSPLIT）
- 会話は独立しているか？
- テンポは速いか？


 CRITICAL: PLACEHOLDER PROTECTION
- Text may contain placeholders like __ENTITY_1__, __ENTITY_2__, etc.
- These represent proper nouns (names, places, items)
- NEVER remove, modify, translate, or reformat placeholders
- Keep them EXACTLY as they appear: __ENTITY_X__
- Do NOT change spacing, capitalization, or underscores

OUTPUT:
- ONLY the adjusted Japanese text
- Use `\\n` for line breaks
- Use `\\n\\n` for paragraph breaks
- NO explanations, NO comments
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
        result = result.replace("[[BREAK]]", "").replace("[[BREAK]]\\n", "")
        
        
        return result
    
    except Exception as e:
        # 에러 발생 시 원본 반환
        print(f"[paragraph_editor_ja] Error: {e}")
        return text
