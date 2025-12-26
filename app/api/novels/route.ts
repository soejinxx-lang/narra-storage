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

export async function GET(_req: NextRequest) {
  const novels = readNovels();
  return NextResponse.json({ novels });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.title) {
    return NextResponse.json(
      { error: "INVALID_NOVEL_DATA" },
      { status: 400 }
    );
  }

  const novels = readNovels();

  const id = body.id ?? `novel-${Date.now()}`;

  const exists = novels.find((n: any) => n.id === id);
  if (exists) {
    return NextResponse.json(
      { error: "NOVEL_ALREADY_EXISTS" },
      { status: 409 }
    );
  }

  const newNovel = {
    id,
    title: body.title,
    description: body.description ?? "",
  };

  novels.push(newNovel);
  writeNovels(novels);

  return NextResponse.json({ novel: newNovel }, { status: 201 });
}
