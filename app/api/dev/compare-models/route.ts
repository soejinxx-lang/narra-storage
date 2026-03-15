import { NextResponse } from "next/server";
import db from "../../../db";

/**
 * 모델 비교 API — 같은 에피소드에 GPT/Grok 각각 댓글 생성 (DB 미삽입)
 * GET /api/dev/compare-models?novelId=xxx&ep=3&count=5
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const novelId = url.searchParams.get("novelId");
    const ep = Number(url.searchParams.get("ep") || "1");
    const count = Math.min(Number(url.searchParams.get("count") || "5"), 10);

    if (!novelId) {
        return NextResponse.json({ error: "novelId required" }, { status: 400 });
    }

    try {
        // 에피소드 콘텐츠 가져오기
        const epResult = await db.query(
            `SELECT content, ep FROM episodes WHERE novel_id = $1 AND ep = $2 LIMIT 1`,
            [novelId, ep]
        );
        if (epResult.rows.length === 0) {
            return NextResponse.json({ error: `Episode ${ep} not found` }, { status: 404 });
        }

        const episodeContent: string = epResult.rows[0].content;

        // 소설 장르
        const novelResult = await db.query(`SELECT genre FROM novels WHERE id = $1`, [novelId]);
        const genreRaw = novelResult.rows[0]?.genre;
        const primaryGenre = Array.isArray(genreRaw) ? genreRaw[0] : (genreRaw || "");

        // 프롬프트 생성 (ko-engine과 동일)
        const SCENE_SEEDS = [
            "특히 감정적으로 격해지는 순간에 집중해.",
            "독자 입장에서 예상 못한 반전이 있다면 거기 반응해.",
            "주인공이 뭔가 결정적인 행동을 하는 장면에 집중해.",
            "분위기가 급격히 바뀌는 순간에 주목해.",
            "캐릭터 간 갈등이나 긴장감 있는 장면에 집중해.",
        ];
        const temperatures = [0.7, 0.8, 0.9, 1.0, 1.1];

        const front = episodeContent.slice(0, 2000);
        const back = episodeContent.length > 2000 ? episodeContent.slice(-4000) : "";
        const context = back ? `${front}\n...(중략)...\n${back}` : front;

        const genreHint = primaryGenre === "romance"
            ? "로맨스/감정 장면에 집중해서 반응해."
            : primaryGenre === "action"
                ? "전투/각성/반전 장면에 집중해서 반응해."
                : "";

        const buildPrompt = (seed: string) => `너는 한국 웹소설 커뮤니티에서 방금 이 에피소드를 읽은 독자야.
${seed}

[규칙]
- 방금 읽으면서 가장 강하게 꽂힌 장면 1개에 반응해
- 그 장면의 구체적인 단서(행동/대사/상황) 최소 1개 포함
- 반응은 즉흥적이고 자연스럽게
- ㅋ, ㅠ, ㄷ, 초성체 자유롭게
- ~다 어미 금지 (미쳤음/ㅁㅊ OK)
- 이모지 금지
- 작품 전반 평가 금지 ("작가님 천재" 류 금지)
- 내용 없는 감탄사("와 미쳤다", "대박이다") 금지
${genreHint}

댓글 딱 1개만, 텍스트로 바로 출력:

[에피소드]
${context}`;

        // GPT 호출
        const callGPT = async (prompt: string, temp: number): Promise<{ text: string; latency: number }> => {
            const start = Date.now();
            const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
            const apiKey = process.env.AZURE_OPENAI_API_KEY;
            const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-01-preview";
            if (!endpoint || !apiKey) return { text: "[Azure 미설정]", latency: 0 };

            const baseUrl = endpoint.replace(/\/openai\/v1\/?$/, "").replace(/\/$/, "");
            const urlStr = `${baseUrl}/openai/deployments/gpt-4omini/chat/completions?api-version=${apiVersion}`;
            const res = await fetch(urlStr, {
                method: "POST",
                headers: { "Content-Type": "application/json", "api-key": apiKey },
                body: JSON.stringify({ messages: [{ role: "user", content: prompt }], temperature: temp, max_tokens: 80 }),
            });
            if (!res.ok) return { text: `[GPT 에러: ${res.status}]`, latency: Date.now() - start };
            const data = await res.json();
            return { text: data.choices?.[0]?.message?.content?.trim() || "", latency: Date.now() - start };
        };

        // Grok 호출
        const callGrok = async (prompt: string, temp: number): Promise<{ text: string; latency: number }> => {
            const start = Date.now();
            const apiKey = process.env.XAI_API_KEY;
            if (!apiKey) return { text: "[Grok 미설정]", latency: 0 };

            const res = await fetch("https://api.x.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "grok-4-latest",
                    messages: [{ role: "user", content: prompt }],
                    temperature: temp, max_tokens: 80, stream: false,
                }),
            });
            if (!res.ok) return { text: `[Grok 에러: ${res.status}]`, latency: Date.now() - start };
            const data = await res.json();
            return { text: data.choices?.[0]?.message?.content?.trim() || "", latency: Date.now() - start };
        };

        // 동일 프롬프트로 양쪽 동시 호출
        const gptResults: { text: string; latency: number; seed: string; temp: number }[] = [];
        const grokResults: { text: string; latency: number; seed: string; temp: number }[] = [];

        const promises = [];
        for (let i = 0; i < count; i++) {
            const seed = SCENE_SEEDS[i % SCENE_SEEDS.length];
            const temp = temperatures[i % temperatures.length];
            const prompt = buildPrompt(seed);

            promises.push(
                callGPT(prompt, temp).then(r => gptResults.push({ ...r, seed, temp })),
                callGrok(prompt, temp).then(r => grokResults.push({ ...r, seed, temp })),
            );
        }
        await Promise.allSettled(promises);

        // 따옴표 제거
        const clean = (s: string) => s.replace(/^[""'']+|[""'']+$/g, "").trim();

        return NextResponse.json({
            novelId,
            episode: ep,
            context_length: episodeContent.length,
            primaryGenre,
            count,
            gpt: gptResults.map(r => ({ comment: clean(r.text), latency_ms: r.latency, seed: r.seed, temp: r.temp })),
            grok: grokResults.map(r => ({ comment: clean(r.text), latency_ms: r.latency, seed: r.seed, temp: r.temp })),
        });
    } catch (error) {
        console.error("Compare Models Error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
