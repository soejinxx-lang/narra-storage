import os
import requests

# ===============================
# Storage API 설정
# ===============================
STORAGE_BASE_URL = os.getenv("STORAGE_BASE_URL")
STORAGE_API_KEY = os.getenv("STORAGE_API_KEY")  # 있으면 사용

if not STORAGE_BASE_URL:
    raise RuntimeError("STORAGE_BASE_URL is not set")

# ===============================
# 내부 유틸
# ===============================
def _headers():
    headers = {
        "Content-Type": "application/json",
    }
    if STORAGE_API_KEY:
        headers["Authorization"] = f"Bearer {STORAGE_API_KEY}"
    return headers


# ===============================
# 기존 인터페이스 유지
# ===============================
def load_entities(title: str) -> dict:
    """
    기존: 로컬 JSON 로드
    변경: Storage API에서 고유명사 로드
    반환 포맷은 기존 파이프라인과 동일
    """
    try:
        res = requests.get(
            f"{STORAGE_BASE_URL}/api/novels/{title}/entities",
            headers=_headers(),
            timeout=10,
        )
        res.raise_for_status()
        data = res.json()
    except Exception:
        # API 장애 시 기존 동작과 동일하게 빈 dict 반환
        return {}

    entities = {}

    # ✅ Storage API 응답 형식: { entities: [...] }
    entity_list = data.get("entities", data if isinstance(data, list) else [])

    for e in entity_list:
        translations = {}

        if isinstance(e.get("translations"), dict):
            translations = e["translations"]
        else:
            t = e.get("translation")
            if isinstance(t, str) and t:
                # 하위 호환: 단일 번역은 en으로 간주
                translations = {"en": t}

        entities[e["source_text"]] = {
            "locked": e.get("locked", True),
            "translations": translations,
        }

    return entities


def save_entities(title: str, entities: dict):
    """
    ⚠️ DEPRECATED
    기존 로컬 JSON 저장 인터페이스 유지용 (NO-OP)
    Storage API 구조에서는 사용되지 않음
    """
    return


def add_entities(title: str, new_entities: list[str]):
    """
    체크된 고유명사만 Storage API에 추가
    기존 시그니처 유지
    """
    for source_text in new_entities:
        try:
            requests.post(
                f"{STORAGE_BASE_URL}/api/novels/{title}/entities",
                headers=_headers(),
                json={
                    "source_text": source_text,
                    "translations": {},   # ✅ 핵심 수정: 계약 일치
                    "category": "기타",
                },
                timeout=10,
            )
        except Exception:
            # 하나 실패해도 전체 파이프라인 중단 방지
            continue
