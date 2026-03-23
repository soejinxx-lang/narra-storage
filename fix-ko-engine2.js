const fs = require('fs');
const path = 'app/api/dev/run-comment-bot/ko-engine.ts';
let c = fs.readFileSync(path, 'utf8');

// Fix: 445~447행 - 템플릿 리터럴 안에 끼어든 코드 복구
// "- ~다 어미 금지\r\n    return passed;\r\n}"
// → 템플릿 닫고, API 호출 + return 복구
const bad = `                    - ~다 어미 금지\r\n    return passed;\r\n}`;
const good = `                    - ~다 어미 금지\`;\r\n\r\n    const raw = await callGrokAPI(prompt, 0.9, 100);\r\n    let reply = raw\r\n        .replace(/^\\\`\\\`\\\`.*\\n?/i, '').replace(/\\n?\\\`\\\`\\\`.*$/i, '')\r\n        .replace(/^[\\\"']|[\\\"']$/g, '')\r\n        .replace(/^원댓글:.*?→\\s*반응:\\s*/g, '')\r\n        .replace(/^반응:\\s*/g, '')\r\n        .trim();\r\n    return reply.length <= 50 ? reply : '';\r\n}`;

if (c.includes(bad)) {
    c = c.replace(bad, good);
    console.log('✅ Fix: generateContextualReply 복구 성공');
} else {
    // CRLF vs LF 문제일 수 있음, LF로 시도
    const badLF = `                    - ~다 어미 금지\n    return passed;\n}`;
    const goodLF = `                    - ~다 어미 금지\`;\n\n    const raw = await callGrokAPI(prompt, 0.9, 100);\n    let reply = raw\n        .replace(/^\\\`\\\`\\\`.*\\n?/i, '').replace(/\\n?\\\`\\\`\\\`.*$/i, '')\n        .replace(/^[\\\"']|[\\\"']$/g, '')\n        .replace(/^원댓글:.*?→\\s*반응:\\s*/g, '')\n        .replace(/^반응:\\s*/g, '')\n        .trim();\n    return reply.length <= 50 ? reply : '';\n}`;
    if (c.includes(badLF)) {
        c = c.replace(badLF, goodLF);
        console.log('✅ Fix (LF): generateContextualReply 복구 성공');
    } else {
        console.log('❌ 패턴 불일치. 라인 445 raw:');
        const lines = c.split('\n');
        console.log(JSON.stringify(lines[444]));
        console.log(JSON.stringify(lines[445]));
        console.log(JSON.stringify(lines[446]));
    }
}

fs.writeFileSync(path, c, 'utf8');
console.log('완료. 줄 수:', c.split('\n').length);
