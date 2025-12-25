import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    novels: [
      {
        id: "test-novel",
        title: "테스트 소설",
        description: "스토리지 서버에서 내려오는 테스트 소설입니다.",
      },
    ],
  });
}
