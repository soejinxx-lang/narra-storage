import os
import json
import re
from translation_core.openai_client import client

SYSTEM_PROMPT = """
너는 웹소설 '한국어 원문'에서 고유명사 후보를 최대한 많이 추출하는 역할이다.
⚠️ 매우 중요:
- 하나라도 빠뜨리면 안 된다
- 확실하지 않아도 '고유명사일 가능성'이 있으면 반드시 포함하라

대상:
- 등장인물 이름
- 지명
- 조직명
- 스킬명
- 아이템명
- 고유 개념명
- 별명, 이명, 호칭
- 세계관 내부에서만 의미를 갖는 단어

규칙:
- 번역하지 마라
- 해석하지 마라
- 판단하지 마라
- 중복 제거하지 마라
- 원문에 등장한 표현을 그대로 사용하라
- 결과는 반드시 JSON 배열만 출력하라
""".strip()


def extract_entities(text: str):
    if not text or not text.strip():
        return []

    results = []

    try:
        text = text.strip()

        # 🔒 길면 나눠서 전부 시도 (누락 방지)
        CHUNK_SIZE = 3000
        chunks = [
            text[i:i + CHUNK_SIZE]
            for i in range(0, len(text), CHUNK_SIZE)
        ]

        for chunk in chunks:
            res = client.chat.completions.create(
                model="gpt-4omini",  # Azure deployment name
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": chunk},
                ],
                temperature=0.2,
            )

            raw = res.choices[0].message.content.strip()

            # 🔥 JSON 배열만 강제 추출
            match = re.search(r"\[[\s\S]*\]", raw)
            if not match:
                # JSON이 아니면 그냥 버림 (침묵)
                continue

            try:
                entities = json.loads(match.group())
            except json.JSONDecodeError:
                continue

            # 🔒 리스트만 허용
            if isinstance(entities, list):
                for e in entities:
                    # 문자열만 허용 (GPT 사고 방지)
                    if isinstance(e, str) and e.strip():
                        results.append(e.strip())

        return results

    except Exception as e:
        print("ENTITY_EXTRACTION_ERROR:", e)
        return []


