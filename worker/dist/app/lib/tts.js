"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAudio = generateAudio;
exports.getVoiceName = getVoiceName;
exports.preprocessText = preprocessText;
exports.splitIntoChunks = splitIntoChunks;
const text_to_speech_1 = require("@google-cloud/text-to-speech");
const VOICE_CONFIG = {
    ko: {
        languageCode: "ko-KR",
        name: "ko-KR-Neural2-A",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
    en: {
        languageCode: "en-US",
        name: "en-US-Neural2-J",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE,
    },
    ja: {
        languageCode: "ja-JP",
        name: "ja-JP-Neural2-B",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
    zh: {
        languageCode: "cmn-CN",
        name: "cmn-CN-Neural2-A",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
    es: {
        languageCode: "es-ES",
        name: "es-ES-Neural2-A",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
    fr: {
        languageCode: "fr-FR",
        name: "fr-FR-Neural2-A",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
    de: {
        languageCode: "de-DE",
        name: "de-DE-Neural2-A",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
    pt: {
        languageCode: "pt-BR",
        name: "pt-BR-Neural2-A",
        ssmlGender: text_to_speech_1.protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
    },
};
let ttsClient = null;
function getTTSClient() {
    if (!ttsClient) {
        const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        if (!credsJson) {
            throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not found");
        }
        try {
            const credentials = JSON.parse(credsJson);
            ttsClient = new text_to_speech_1.TextToSpeechClient({ credentials });
        }
        catch (error) {
            throw new Error(`Failed to create TTS client: ${error}`);
        }
    }
    return ttsClient;
}
async function generateAudio(text, language, speakingRate = 1.0) {
    const config = VOICE_CONFIG[language];
    if (!config)
        throw new Error(`Unsupported language: ${language}`);
    const client = getTTSClient();
    const request = {
        input: { text },
        voice: {
            languageCode: config.languageCode,
            name: config.name,
            ssmlGender: config.ssmlGender,
        },
        audioConfig: {
            audioEncoding: text_to_speech_1.protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
            speakingRate,
            sampleRateHertz: 24000,
        },
    };
    const [response] = await client.synthesizeSpeech(request);
    if (!response.audioContent)
        throw new Error("No audio content received");
    return Buffer.from(response.audioContent);
}
function getVoiceName(language) {
    var _a;
    return ((_a = VOICE_CONFIG[language]) === null || _a === void 0 ? void 0 : _a.name) || null;
}
function preprocessText(text) {
    if (!text)
        return "";
    text = text.replace(/「/g, '"').replace(/」/g, '"');
    text = text.replace(/『/g, '"').replace(/』/g, '"');
    text = text.replace(/“/g, '"').replace(/”/g, '"');
    text = text.replace(/‘/g, "'").replace(/’/g, "'");
    text = text.replace(/—/g, "-").replace(/–/g, "-");
    text = text.replace(/\.{3,}/g, ".").replace(/…/g, ".");
    text = text.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
    text = text.replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ");
    return text.trim();
}
function splitIntoChunks(text, maxChars = 4500) {
    if (text.length <= maxChars)
        return [text];
    const chunks = [];
    const paragraphs = text.split("\n\n");
    let currentChunk = "";
    for (const para of paragraphs) {
        if (currentChunk.length + para.length + 2 <= maxChars) {
            currentChunk += (currentChunk ? "\n\n" : "") + para;
        }
        else {
            if (currentChunk)
                chunks.push(currentChunk);
            if (para.length > maxChars) {
                const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
                let tempChunk = "";
                for (const sentence of sentences) {
                    if (tempChunk.length + sentence.length <= maxChars) {
                        tempChunk += sentence;
                    }
                    else {
                        if (tempChunk)
                            chunks.push(tempChunk);
                        tempChunk = sentence;
                    }
                }
                if (tempChunk)
                    chunks.push(tempChunk);
                currentChunk = "";
            }
            else {
                currentChunk = para;
            }
        }
    }
    if (currentChunk)
        chunks.push(currentChunk);
    return chunks;
}
