import os
from translation_core.openai_client import client

MODEL = "gpt-4omini"  # Azure deployment name

SYSTEM_PROMPT = """
You are a PROFESSIONAL COMMERCIAL WEB NOVEL TRANSLATOR.

Rules:
- Do NOT summarize
- Do NOT omit lines
- Do NOT merge or split sentences arbitrarily
- Preserve paragraph structure
- Translate faithfully and naturally
""".strip()


def translate_text_block(text: str) -> str:
    if not text.strip():
        return text

    res = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
    )

    return res.choices[0].message.content.strip()
