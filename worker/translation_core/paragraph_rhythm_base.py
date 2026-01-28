"""
Paragraph Rhythm Base - Language-Neutral Break Candidate Generator

역할:
- 문단을 자르지 않음
- "여기서 끊기면 자연스러울 수 있다"는 지점만 [[BREAK]] 마커로 표시
- 모든 언어 공통 사용
"""

import re

# ===============================
# 서사 압력 후보(BREAK_CANDIDATE) 생성 규칙
# ===============================

def mark_break_candidates(text: str) -> str:
    """
    언어 중립적 문단 분할 후보 생성
    
    [[BREAK]] 마커를 문장 사이에 삽입하되, 문장 자체는 수정하지 않음
    
    후보 생성 기준:
    1. 서사 전환 (시점 변화)
    2. 행동 전환 (움직임 동사)
    3. 감각 전환 (시간/공간)
    4. 내적 독백 / 강조
    5. 대사 경계
    """
    
    if not text.strip():
        return text
    
    # 문장 단위로 분리 (마침표, 물음표, 느낌표 기준)
    # 단, 따옴표 내부는 제외
    sentences = _split_into_sentences(text)
    
    result = []
    
    for i, sentence in enumerate(sentences):
        result.append(sentence)
        
        # 마지막 문장은 후보 체크 불필요
        if i == len(sentences) - 1:
            continue
        
        next_sentence = sentences[i + 1] if i + 1 < len(sentences) else ""
        
        # 후보 판단
        should_mark = False
        
        # 1. 대사 경계
        if _is_dialogue(sentence) or _is_dialogue(next_sentence):
            should_mark = True
        
        # 2. 행동 전환 (움직임 동사)
        elif _has_action_verb(next_sentence):
            should_mark = True
        
        # 3. 시간/감각 전환 표현
        elif _has_transition_marker(next_sentence):
            should_mark = True
        
        # 4. 내적 독백 / 강조
        elif _is_internal_thought(sentence):
            should_mark = True
        
        # 5. 짧은 문장 (30자 이하)
        elif len(sentence.strip()) < 30:
            should_mark = True
        
        if should_mark:
            result.append("\n[[BREAK]]\n")
    
    return "".join(result)


def _split_into_sentences(text: str) -> list:
    """
    텍스트를 문장 단위로 분리
    
    규칙:
    - 마침표(.), 물음표(?), 느낌표(!) 기준
    - 따옴표 내부는 보호
    - 줄바꿈은 보존
    """
    # 간단한 구현: 마침표/물음표/느낌표 + 공백 기준
    # TODO: 더 정교한 문장 분리 필요 시 확장
    
    sentences = []
    current = ""
    in_quote = False
    
    for i, char in enumerate(text):
        current += char
        
        # 따옴표 상태 추적
        if char in ['"', '"', '"', '「', '」']:
            in_quote = not in_quote
        
        # 문장 종결
        if char in ['.', '?', '!', '。', '？', '！'] and not in_quote:
            # 다음 문자가 공백이거나 줄바꿈이면 문장 종결
            if i + 1 < len(text) and text[i + 1] in [' ', '\n', '\r']:
                sentences.append(current)
                current = ""
    
    # 남은 텍스트
    if current.strip():
        sentences.append(current)
    
    return sentences


def _is_dialogue(sentence: str) -> bool:
    """대사 여부 판단"""
    # 큰따옴표, 일본어 따옴표 포함
    quote_chars = ['"', '"', '"', '「', '」']
    return any(q in sentence for q in quote_chars)


def _has_action_verb(sentence: str) -> bool:
    """행동 전환 동사 포함 여부"""
    # 영어 행동 동사
    action_verbs_en = [
        'ran', 'walked', 'jumped', 'stopped', 'opened', 'closed',
        'turned', 'moved', 'grabbed', 'threw', 'kicked', 'hit',
        'stood', 'sat', 'fell', 'climbed', 'rushed'
    ]
    
    # 일본어 행동 동사 (간단한 패턴)
    action_verbs_ja = [
        '走った', '歩いた', '飛んだ', '止まった', '開けた', '閉めた',
        '振り向いた', '動いた', '掴んだ', '投げた', '蹴った'
    ]
    
    sentence_lower = sentence.lower()
    
    return (
        any(verb in sentence_lower for verb in action_verbs_en) or
        any(verb in sentence for verb in action_verbs_ja)
    )


def _has_transition_marker(sentence: str) -> bool:
    """시간/감각 전환 표현 포함 여부"""
    markers_en = [
        'suddenly', 'at that moment', 'then', 'meanwhile',
        'after that', 'before that', 'however', 'but'
    ]
    
    markers_ja = [
        'その時', 'そして', 'しかし', 'だが', '突然',
        'その後', 'やがて', 'すると'
    ]
    
    sentence_lower = sentence.lower()
    
    return (
        any(marker in sentence_lower for marker in markers_en) or
        any(marker in sentence for marker in markers_ja)
    )


def _is_internal_thought(sentence: str) -> bool:
    """내적 독백 / 강조 여부"""
    # 말줄임표, 대시
    thought_markers = ['...', '…', '—', '――']
    
    return any(marker in sentence for marker in thought_markers)


def calculate_pressure_score(text: str) -> dict:
    """
    문단 압력 점수 계산 (디버깅/분석용)
    
    반환값:
    {
        'sentence_count': int,
        'avg_sentence_length': float,
        'break_candidates': int,
        'has_dialogue': bool,
        'pressure_score': float  # 0.0 ~ 1.0
    }
    """
    sentences = _split_into_sentences(text)
    marked_text = mark_break_candidates(text)
    
    sentence_count = len(sentences)
    avg_length = sum(len(s) for s in sentences) / max(sentence_count, 1)
    break_count = marked_text.count('[[BREAK]]')
    has_dialogue = any(_is_dialogue(s) for s in sentences)
    
    # 압력 점수 계산 (휴리스틱)
    score = 0.0
    
    # 문장 수가 많을수록 높음
    score += min(sentence_count / 5, 1.0) * 0.3
    
    # 평균 문장 길이가 짧을수록 높음
    score += max(0, 1 - avg_length / 100) * 0.2
    
    # 후보가 많을수록 높음
    score += min(break_count / sentence_count, 1.0) * 0.3 if sentence_count > 0 else 0
    
    # 대사 포함 시 가중치
    if has_dialogue:
        score += 0.2
    
    return {
        'sentence_count': sentence_count,
        'avg_sentence_length': avg_length,
        'break_candidates': break_count,
        'has_dialogue': has_dialogue,
        'pressure_score': min(score, 1.0)
    }
