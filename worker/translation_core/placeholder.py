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
    
    Note: entities는 이미 pipeline.py에서 필터링되어
    {source_name: translated_value} 형태의 string 값을 담고 있음.
    """

    for token, source_name in mapping.items():
        # entities[source_name]이 이미 번역된 값(string)
        # 없으면 원문(source_name) 유지
        replacement = entities.get(source_name, source_name)
        text = text.replace(token, replacement)

    return text
