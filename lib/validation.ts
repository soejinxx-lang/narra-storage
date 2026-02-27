import { NextResponse } from "next/server";

// ── 길이 제한 상수 ──
export const LIMITS = {
    TITLE: 200,
    DESCRIPTION: 5000,
    CONTENT: 30000,       // 전세계 웹소설 1화 최대 ~15K의 2배
    ENTITY_SOURCE: 500,
    COMMENT: 2000,
} as const;

/**
 * 문자열 길이 검증.
 * 초과 시 에러 코드 문자열 반환, 정상이면 null.
 */
export function validateLength(
    value: string | undefined | null,
    field: string,
    max: number
): string | null {
    if (!value) return null;
    if (typeof value !== "string") return `${field}_INVALID_TYPE`;
    if (value.length > max) return `${field}_TOO_LONG`;
    return null;
}

/**
 * 여러 필드를 한꺼번에 검증.
 * 첫 번째 에러 발견 시 NextResponse 반환, 전부 통과하면 null.
 */
export function validateFields(
    checks: Array<{ value: string | undefined | null; field: string; max: number }>
): NextResponse | null {
    for (const { value, field, max } of checks) {
        const err = validateLength(value, field, max);
        if (err) {
            return NextResponse.json(
                { error: err, maxLength: max },
                { status: 400 }
            );
        }
    }
    return null;
}
