def chunk_text(text: str, max_chars: int = 2000):
    """
    긴 텍스트를 줄 단위로 안전하게 분할한다.
    GPT 입력 길이 초과 방지용.
    """
    chunks = []
    buf = ""

    for line in text.splitlines(keepends=True):
        if len(buf) + len(line) > max_chars:
            if buf.strip():
                chunks.append(buf)
            buf = line
        else:
            buf += line

    if buf.strip():
        chunks.append(buf)

    return chunks
