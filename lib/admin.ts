import { NextRequest, NextResponse } from "next/server";

const ADMIN_KEY = process.env.ADMIN_API_KEY;

export function requireAdmin(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (!ADMIN_KEY || auth !== `Bearer ${ADMIN_KEY}`) {
        return NextResponse.json(
            { error: "UNAUTHORIZED" },
            { status: 401 }
        );
    }
}

