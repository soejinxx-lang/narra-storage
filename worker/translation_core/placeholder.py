# translation_core/placeholder.py

import uuid
import re


def apply_placeholders(text: str, entities: dict):
    """
    Replace entity names with unique placeholders.
    Longer names are replaced first to avoid partial collisions.
    Word-boundary safe replacement is enforced.
    """

    mapping = {}

    # 🔑 길이 긴 고유명사부터 처리 (부분 충돌 방지)
    sorted_names = sorted(entities.keys(), key=len, reverse=True)

    for name in sorted_names:
        # 🔒 ASCII 기반, GPT 안전 placeholder
        token = f"__ENTITY_{uuid.uuid4().hex}__"

        # 🔒 단어 경계 기반 치환 (부분 오염 방지)
        pattern = re.compile(rf'(?<!\w){re.escape(name)}(?!\w)')

        if pattern.search(text):
            text = pattern.sub(token, text)
            mapping[token] = name

    return text, mapping


def restore_placeholders(text: str, mapping: dict, entities: dict, target_language: str = "en"):
    """
    Restore placeholders using stored entity translations.
    """

    for token, source_name in mapping.items():
        ent = entities.get(source_name)

        if ent and isinstance(ent, dict):
            # 새로운 구조: {"locked": True, "translations": {"en": "...", "ja": "..."}}
            translations = ent.get("translations", {})
            if isinstance(translations, dict) and target_language in translations:
                replacement = translations[target_language]
            else:
                replacement = source_name  # fallback: 원문 유지
        else:
            replacement = source_name  # fallback: 원문 유지

        text = text.replace(token, replacement)

    return text
