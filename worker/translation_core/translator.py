import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL = "gpt-4o"

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
