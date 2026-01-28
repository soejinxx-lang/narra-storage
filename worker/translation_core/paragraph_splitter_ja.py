"""
일본어 전용 문단 안전 분할

목적: 과도한 문단 덩어리 방지 (리듬 생성 아님)

원칙:
- LLM 사용 금지
- 의미/감정/리듬 판단 금지
- 문장 이동/병합 금지
- 오직 줄바꿈(\n\n) 삽입만
"""


def split_long_paragraphs_ja(text: str, max_sentences: int = 5) -> str:
    """
    일본어 문단 안전 분할
    
    규칙:
    - 하나의 문단에 。가 max_sentences개 이상이면 중간에 \n\n 삽입
    - 문장 순서 유지
    - 대사 블록(「」)은 그대로 유지
    - 의미/어휘/조사 변경 금지
    
    Args:
        text: 일본어 텍스트
        max_sentences: 문단당 최대 문장 수 (기본 5개)
    
    Returns:
        분할된 텍스트
    """
    if not text or not text.strip():
        return text
    
    try:
        # 문단 단위로 분리
        paragraphs = text.split("\n\n")
        result_paragraphs = []
        
        for para in paragraphs:
            if not para.strip():
                continue
            
            # 대사 블록 확인 (「」 포함)
            if "「" in para and "」" in para:
                # 대사는 단독 문단 유지
                result_paragraphs.append(para)
                continue
            
            # 문장 개수 세기 (。 기준)
            sentence_count = para.count("。")
            
            if sentence_count <= max_sentences:
                # 문장이 적으면 그대로
                result_paragraphs.append(para)
            else:
                # 문장이 많으면 중간에 분할
                # 문장을 추출 (순서 유지)
                sentences = []
                temp = ""
                for char in para:
                    temp += char
                    if char == "。":
                        sentences.append(temp)
                        temp = ""
                # 마지막 남은 부분 (。로 끝나지 않는 경우)
                if temp.strip():
                    sentences.append(temp)
                
                # sentences를 max_sentences개씩 묶어서 \n\n으로 연결
                chunks = []
                chunk = []
                for sent in sentences:
                    chunk.append(sent)
                    if len(chunk) >= max_sentences:
                        chunks.append("".join(chunk))
                        chunk = []
                # 남은 문장 처리
                if chunk:
                    chunks.append("".join(chunk))
                
                # 분할된 문단들을 결과에 추가
                for c in chunks:
                    if c.strip():
                        result_paragraphs.append(c.strip())
        
        # 결과 반환
        if not result_paragraphs:
            return text
        
        return "\n\n".join(result_paragraphs)
    
    except Exception as e:
        # 에러 발생 시 원본 반환
        print(f"[paragraph_splitter_ja] Error: {e}")
        return text
