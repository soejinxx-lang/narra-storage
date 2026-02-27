import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * App Router용 body size 체크.
 * content-length 헤더 기반 1차 방어선.
 *
 * 한계: chunked 전송 시 content-length 없을 수 있고, 헤더 조작 가능.
 * 그래도 일반적인 대용량 폭탄 요청은 차단 가능.
 */
export function checkBodySize(req: NextRequest): NextResponse | null {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return NextResponse.json(
            { error: "PAYLOAD_TOO_LARGE" },
            { status: 413 }
        );
    }
    return null;
}
