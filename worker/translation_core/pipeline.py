import os
from openai import OpenAI

# 🔗 고유명사 파이프라인 연결
from translation_core.entity_store import load_entities
from translation_core.placeholder import apply_placeholders, restore_placeholders

# 🔗 영어 문단 리듬 에디터 (영어 전용 - LLM 기반)
from translation_core.paragraph_editor_en import restructure_paragraphs_en

# 🔗 일본어 문단 리듬 에디터 (일본어 전용 - LLM 기반)
from translation_core.paragraph_editor_ja import restructure_paragraphs_ja

# 🔗 일본어 문단 안전 분할 (일본어 전용 - 규칙 기반, 레거시)
from translation_core.paragraph_splitter_ja import split_long_paragraphs_ja

# ===============================
# OpenAI Client
# ===============================
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

MODEL = "gpt-4o"

# ===============================
# 🔒 IMMUTABLE RULES (불변 규칙)
# ===============================
IMMUTABLE_RULES = """
IMMUTABLE RULES:
- Do NOT increase emotional intensity compared to the source text.
- Avoid adding emotional adjectives unless explicitly present in the source.
- Prefer direct verbs; avoid descriptive embellishment.
- Do NOT add rhetorical emphasis or stylistic flair.
- Do NOT change formality or casualness beyond what is present in the source.
""".strip()

# ===============================
# 🔒 STAGE 1: TRANSLATION PROMPT (언어 중립)
# ===============================
TRANSLATION_PROMPT = f"""
You are a PROFESSIONAL COMMERCIAL WEB NOVEL TRANSLATOR
working for a global web novel distribution platform.

IMPORTANT CONTEXT:
- The input text is written entirely in the SOURCE LANGUAGE.
- Translate ALL content into the TARGET LANGUAGE specified by the system.
- Do NOT assume any part is already translated.

TRANSLATION PURPOSE:
- This translation is for PAID COMMERCIAL DISTRIBUTION.
- The goal is SAFE, READABLE, SELLABLE quality.
- Literary brilliance is NOT required.

STRICT RULES:
- Do NOT summarize, omit, or add content.
- Do NOT change sentence order.
- Translate EVERYTHING, including narration and dialogue.
- Numeric-only or symbol-heavy lines must remain unchanged.

STYLE GUIDELINES:
- Translate as if the text had originally been drafted in the TARGET LANGUAGE,
  WITHOUT changing meaning, plot, or character intent.
- Prefer clarity and natural language over literal structure.
- Do NOT preserve source-language word order or particles.
- Do NOT add uncertainty, hedging, or self-distancing
  unless explicitly present in the source text.

STRUCTURE GUIDELINES:
- You MAY adjust paragraph breaks to improve web novel readability.
- Do NOT change sentence order.
- Do NOT remove or add sentences.
- Do NOT merge dialogue with narration.
- Dialogue lines must remain standalone paragraphs.
- Short narrative sentences may stand alone.
- Consecutive narration sentences may be grouped into longer paragraphs
  if it improves reading flow.

DIALOGUE LOCALIZATION:
- Formal speech → Professional but approachable tone.
- Polite speech → Standard friendly dialogue.
- Casual speech → Natural casual language.
- Do NOT introduce slang or contractions not present in the source.

TECHNICAL CONSTRAINTS:
- Placeholders such as __ENTITY_x__ represent locked proper nouns.
- NEVER translate, modify, remove, or reformat placeholders.

{IMMUTABLE_RULES}

OUTPUT:
- Output ONLY the translated text in the TARGET LANGUAGE.
""".strip()

# ===============================
# 🔍 STAGE 2: EDITOR PROMPT (공통)
# ===============================
EDITOR_PROMPT = f"""
You are a PROFESSIONAL PLATFORM FICTION EDITOR
preparing a translated web novel for paid release.

YOUR ROLE:
- Improve clarity and readability WITHOUT changing meaning.
- Do NOT judge, reinterpret, or rewrite creatively.

STRICT CONSTRAINTS:
- Do NOT add, remove, or alter meaning.
- Do NOT summarize.
- Do NOT change paragraph breaks or line order.
- Do NOT touch placeholders such as __ENTITY_x__.
- Do NOT translate content; editing only.

NORMALIZE ONLY IF PRESENT:
- Passive constructions → Active voice (where natural).
- Repetitive sentence starters → Varied but neutral structure.
- Overly stiff or mechanical phrasing → Common, natural language.
- Self-hedging expressions that weaken narrative confidence.

SIMPLIFY ONLY IF PRESENT:
- 'seemed to' + verb → Direct verb (unless uncertainty is explicit).
- 'appeared to' + verb → Direct verb.
- Multiple descriptors → Strongest single descriptor.

{IMMUTABLE_RULES}

OUTPUT:
- Output ONLY the revised text.
""".strip()

# ===============================
# 🔤 언어 코드 → 언어명 매핑
# ===============================
LANGUAGE_NAMES = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
    "zh": "Chinese (Simplified)",
    "de": "German",
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
    "id": "Indonesian",
}

# ===============================
# 내부용: 텍스트 분할
# ===============================
def _split_text(text: str, max_chars: int = 2000):
    """
    원본 텍스트를 청크로 분할
    
    원칙:
    - 시스템은 문단을 '이해'하지 않음
    - 단지 원본 문자열의 \n\n을 기술적 분할의 최소 단위로 존중
    - 문단 경계(\n\n)에서만 청크 분할
    - 문단 중간에서 청크를 끊지 않음
    """
    chunks = []
    buffer = ""

    # 원본 문자열의 \n\n 기준으로 분리
    paragraphs = text.split("\n\n")

    for para in paragraphs:
        # 문단이 max_chars를 초과하면 단독 청크로
        if len(para) > max_chars:
            # buffer가 있으면 먼저 저장
            if buffer.strip():
                chunks.append(buffer.rstrip("\n\n"))
                buffer = ""
            # 긴 문단은 단독 청크
            chunks.append(para)
            continue
        
        # 문단을 buffer에 추가 시도
        test_buffer = buffer + para + "\n\n"
        
        if len(test_buffer) > max_chars:
            # buffer 저장
            if buffer.strip():
                chunks.append(buffer.rstrip("\n\n"))
            # 새 buffer 시작
            buffer = para + "\n\n"
        else:
            buffer = test_buffer

    # 남은 buffer 저장
    if buffer.strip():
        chunks.append(buffer.rstrip("\n\n"))

    return chunks

# ===============================
# 내부용: 1단계 번역
# ===============================
def _translate_block(text: str, source_language: str, target_language: str) -> str:
    if not text.strip():
        return text

    res = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    f"SOURCE LANGUAGE: {source_language}\n"
                    f"TARGET LANGUAGE: {target_language}\n"
                    f"The input text is written entirely in {source_language}.\n"
                    f"You MUST translate it into {target_language}.\n"
                    f"Output MUST be written ONLY in {target_language}."
                )
            },
            {
                "role": "system",
                "content": TRANSLATION_PROMPT
            },
            {
                "role": "user",
                "content": text
            },
        ],
        temperature=0.3,
    )

    return res.choices[0].message.content.strip()

# ===============================
# 내부용: 2단계 편집
# ===============================
def _edit_block(text: str, target_language: str) -> str:
    if not text.strip():
        return text

    res = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    f"The following text is written in {target_language}.\n"
                    f"You MUST keep the output in {target_language}.\n"
                    f"Do NOT translate into any other language.\n"
                    f"{EDITOR_PROMPT}"
                )
            },
            {"role": "user", "content": text},
        ],
        temperature=0.4,
    )

    return res.choices[0].message.content.strip()

# ===============================
# 내부용: 3단계 고급 에디터 (EN / JA / ZH)
# ===============================
def _advanced_editor(text: str, language: str) -> str:
    if not text.strip():
        return text

    if language == "en":
        system_prompt = (
            "You are a professional English web novel editor.\n"
            "The text language is English.\n"
            "You MUST keep the output in English.\n"
            "Improve naturalness and readability for commercial publication.\n"
            "Do NOT change meaning, plot, or tone.\n"
            "Do NOT add or remove content.\n"
            f"{IMMUTABLE_RULES}"
        )

    elif language == "ja":
        system_prompt = (
            "You are a professional Japanese web novel editor.\n"
            "The text language is Japanese.\n"
            "You MUST keep the output in Japanese.\n"
            "自然で商業作品として通用する日本語に整えてください。\n"
            "意味・展開・文量は絶対に変更しないでください。\n"
            "省略・要約・再解釈は禁止です。\n"
            f"{IMMUTABLE_RULES}"
        )

    elif language == "zh":
        system_prompt = (
            "You are a professional Chinese web novel editor.\n"
            "The text language is Chinese (Simplified).\n"
            "You MUST keep the output in Chinese (Simplified).\n"
            "这是已经完成翻译的中文正文，请进行润色而不是改写。\n"
            "禁止删减内容、禁止概括总结、禁止改变结构。\n"
            f"{IMMUTABLE_RULES}"
        )

    else:
        return text

    res = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        temperature=0.35,
    )

    return res.choices[0].message.content.strip()

# ===============================
# 블록 구조 처리 (가독성 향상)
# ===============================
def _split_into_blocks(text: str) -> list:
    """
    블록 분해: 빈 줄(\n\n) 기준으로 블록 분리
    - 연속된 줄 = 같은 블록
    - 빈 줄 = 블록 경계
    """
    blocks = []
    for block in text.split("\n\n"):
        block = block.strip()
        if block:
            blocks.append(block)
    return blocks


def _classify_block_type(block: str) -> str:
    """
    블록 타입 분류 (기계적)
    규칙:
    - 큰따옴표(") 2개 이상 → DIALOGUE
    - 그 외 → NARRATION
    """
    if block.count('"') >= 2:
        return "DIALOGUE"
    return "NARRATION"


def _reconstruct_blocks(blocks: list) -> str:
    """
    블록 재조합
    - 대사: 단독 문단 유지
    - 서술: 80자 이하는 단독, 80자 초과는 최대 2개까지 병합
    - 웹소설 짧은 줄 리듬 보존
    """
    if not blocks:
        return ""
    
    SHORT_LINE_MAX = 80
    merged = []
    narration_buffer = []
    
    for block_data in blocks:
        if block_data["type"] == "DIALOGUE":
            # 대사 전에 모인 서술 병합
            if narration_buffer:
                merged.append("\n".join(narration_buffer))
                narration_buffer = []
            # 대사는 단독 문단
            merged.append(block_data["content"])
        else:  # NARRATION
            # 짧은 줄은 병합하지 않음
            if len(block_data["content"]) <= SHORT_LINE_MAX:
                # buffer 먼저 flush
                if narration_buffer:
                    merged.append("\n".join(narration_buffer))
                    narration_buffer = []
                # 짧은 줄은 단독 추가
                merged.append(block_data["content"])
            else:
                # 긴 줄은 buffer에 추가
                narration_buffer.append(block_data["content"])
                # 2개 모이면 flush
                if len(narration_buffer) >= 2:
                    merged.append("\n".join(narration_buffer))
                    narration_buffer = []
    
    # 남은 서술 처리
    if narration_buffer:
        merged.append("\n".join(narration_buffer))
    
    # 블록 간 빈 줄 유지
    return "\n\n".join(merged)


def _process_structure(text: str) -> str:
    """
    번역 완료 텍스트 → 구조화된 최종 출력
    
    [1] 블록 분해 (줄바꿈 기준)
    [2] 블록 타입 분류 (기계적)
    [3] 블록 재조합 (순서/내용 유지)
    """
    if not text.strip():
        return text
    
    # [1] 블록 분해
    blocks = _split_into_blocks(text)
    
    # [2] 블록 타입 분류
    typed_blocks = []
    for block in blocks:
        block_type = _classify_block_type(block)
        typed_blocks.append({
            "type": block_type,
            "content": block,  # 원본 그대로 (수정 금지)
        })
    
    # [3] 블록 재조합
    result = _reconstruct_blocks(typed_blocks)
    
    return result


# ===============================
# 🔥 외부 공개 함수
# ===============================
def translate_text(
    title: str,
    text: str,
    source_language: str = "ko",
    target_language: str = "en",
) -> str:
    """
    translate_text: 문단 구조 보존 전용
    
    규칙:
    1. 입력 문단 수 = 출력 문단 수
    2. 문단 경계(\n\n)는 오직 원본에서만
    3. 청크는 문단 내부 기술 처리에만 사용
    4. 구조 생성·정리·개선·최적화 금지
    
    이 함수는 문단 구조를 "보존"만 한다.
    생성·정리·개선·최적화는 하지 않는다.
    """
    if not text.strip():
        return ""

    source_lang_name = LANGUAGE_NAMES.get(source_language, "Korean")
    target_lang_name = LANGUAGE_NAMES.get(target_language, "English")

    raw_entities = load_entities(title)

    entities = {
        k: v["translations"][target_language]
        for k, v in raw_entities.items()
        if (
            isinstance(v, dict)
            and v.get("locked") is True
            and isinstance(v.get("translations"), dict)
            and target_language in v["translations"]
        )
    }

    # 🔒 문단 기준 처리 (원본 구조 보존)
    paragraphs = text.split("\n\n")
    translated_paragraphs = []

    for para in paragraphs:
        if not para.strip():
            translated_paragraphs.append(para)
            continue

        # 문단 길이에 따른 처리 분기
        if len(para) <= 2000:
            # 짧은 문단: 직접 번역
            replaced_text, mapping = apply_placeholders(para, entities)

            translated = _translate_block(
                replaced_text,
                source_lang_name,
                target_lang_name,
            )
            edited = _edit_block(translated, target_lang_name)
            edited = _advanced_editor(edited, target_language)

            restored = restore_placeholders(edited, mapping, entities)
            translated_paragraphs.append(restored)
        else:
            # 긴 문단: 내부 청크 분할 → 번역 → 단일 문단으로 복원
            # 🔒 주의: 이 분할은 문단 내부 기술 처리용이며,
            #          출력에서는 반드시 하나의 문단으로 복원됨
            chunks = _split_text(para)
            chunk_results = []

            for chunk in chunks:
                replaced_text, mapping = apply_placeholders(chunk, entities)

                translated = _translate_block(
                    replaced_text,
                    source_lang_name,
                    target_lang_name,
                )
                edited = _edit_block(translated, target_lang_name)
                edited = _advanced_editor(edited, target_language)

                restored = restore_placeholders(edited, mapping, entities)
                chunk_results.append(restored)

            # 🔒 중요: \n으로만 연결 (문단 내부이므로 \n\n 아님)
            merged_para = "\n".join(chunk_results)
            translated_paragraphs.append(merged_para)

    # 🔒 문단 복원: 원본과 동일한 문단 경계(\n\n)로 연결
    final_text = "\n\n".join(translated_paragraphs)
    
    # 구조 처리 (기존 로직 유지)
    structured_text = _process_structure(final_text)
    
    # 언어별 후처리 (GPT 설계 - 2단계 문단 리듬 시스템)
    # 영어: LLM 기반 문단 리듬 조정 (후보 생성 + LLM 판단)
    if target_language == "en":
        structured_text = restructure_paragraphs_en(structured_text)
    
    # 일본어: LLM 기반 문단 리듬 조정 (나로우/카쿠요무 스타일)
    elif target_language == "ja":
        structured_text = restructure_paragraphs_ja(structured_text)
    # 한국어/중국어/기타: 기존 파이프라인 유지
    
    return structured_text
