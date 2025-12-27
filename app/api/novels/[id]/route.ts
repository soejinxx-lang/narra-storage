import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const dataPath = path.join(process.cwd(), "data", "novels.json");

function readNovels() {
  if (!fs.existsSync(dataPath)) {
    return [];
  }
  const raw = fs.readFileSync(dataPath, "utf-8");
  return JSON.parse(raw);
}

function writeNovels(novels: any[]) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(novels, null, 2), "utf-8");
}

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;
  const novels = readNovels();
  const novel = novels.find((n: any) => n.id === id);

  if (!novel) {
    return NextResponse.json(
      { error: "NOVEL_NOT_FOUND" },
      { status: 404 }
    );
  }

  return NextResponse.json(novel);
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  const novels = readNovels();
  const filtered = novels.filter((n: any) => n.id !== id);

  writeNovels(filtered);

  // ✅ 작품이 상위 → 하위는 논리적으로 함께 삭제된 것으로 간주
  return NextResponse.json({ ok: true });
}
