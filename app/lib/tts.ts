import { TextToSpeechClient, protos } from "@google-cloud/text-to-speech";

const VOICE_CONFIG: Record<
  string,
  {
    languageCode: string;
    name: string;
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender;
  }
> = {
  ko: {
    languageCode: "ko-KR",
    name: "ko-KR-Neural2-A",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
  en: {
    languageCode: "en-US",
    name: "en-US-Neural2-J",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE,
  },
  ja: {
    languageCode: "ja-JP",
    name: "ja-JP-Neural2-B",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
  zh: {
    languageCode: "cmn-CN",
    name: "cmn-CN-Neural2-A",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
  es: {
    languageCode: "es-ES",
    name: "es-ES-Neural2-A",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
  fr: {
    languageCode: "fr-FR",
    name: "fr-FR-Neural2-A",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
  de: {
    languageCode: "de-DE",
    name: "de-DE-Neural2-A",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
  pt: {
    languageCode: "pt-BR",
    name: "pt-BR-Neural2-A",
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE,
  },
};

let ttsClient: TextToSpeechClient | null = null;

function getTTSClient(): TextToSpeechClient {
  if (!ttsClient) {
    const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!credsJson) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON not found");
    }
    try {
      const credentials = JSON.parse(credsJson);
      ttsClient = new TextToSpeechClient({ credentials });
    } catch (error) {
      throw new Error(`Failed to create TTS client: ${error}`);
    }
  }
  return ttsClient;
}

export async function generateAudio(
  text: string,
  language: string,
  speakingRate: number = 1.0
): Promise<Buffer> {
  const config = VOICE_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const client = getTTSClient();
  const request = {
    input: { text },
    voice: {
      languageCode: config.languageCode,
      name: config.name,
      ssmlGender: config.ssmlGender,
    },
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
      speakingRate,
      sampleRateHertz: 24000,
    },
  };

  const [response] = await client.synthesizeSpeech(request);
  if (!response.audioContent) throw new Error("No audio content received");
  return Buffer.from(response.audioContent);
}

export function getVoiceName(language: string): string | null {
  return VOICE_CONFIG[language]?.name || null;
}

export function preprocessText(text: string): string {
  if (!text) return "";
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

export function splitIntoChunks(text: string, maxChars: number = 4500): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split("\n\n");
  let currentChunk = "";

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 <= maxChars) {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      if (para.length > maxChars) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        let tempChunk = "";

        for (const sentence of sentences) {
          if (tempChunk.length + sentence.length <= maxChars) {
            tempChunk += sentence;
          } else {
            if (tempChunk) chunks.push(tempChunk);
            tempChunk = sentence;
          }
        }
        if (tempChunk) chunks.push(tempChunk);
        currentChunk = "";
      } else {
        currentChunk = para;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}
