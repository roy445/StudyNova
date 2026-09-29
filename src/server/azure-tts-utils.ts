const DEFAULT_VOICES: Record<string, string> = {
  "zh-TW": "zh-TW-HsiaoChenNeural",
  "zh-CN": "zh-CN-XiaoxiaoNeural",
  "en-US": "en-US-JennyNeural",
  "ja-JP": "ja-JP-NanamiNeural",
  "ko-KR": "ko-KR-SunHiNeural",
  "ru-RU": "ru-RU-SvetlanaNeural",
};

const SUPPORTED_VOICES = new Set([
  "zh-TW-HsiaoChenNeural",
  "zh-TW-HsiaoYuNeural",
  "zh-TW-YunJheNeural",
  "zh-CN-XiaoxiaoNeural",
  "en-US-JennyNeural",
  "ja-JP-NanamiNeural",
  "ko-KR-SunHiNeural",
  "ru-RU-SvetlanaNeural",
]);

function xmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&apos;";
    }
  });
}

export function buildAzureSsml(input: { text: string; language: string; voice: string; speed: number }) {
  const language = input.language.trim();
  const defaultVoice = DEFAULT_VOICES[language];
  if (!defaultVoice) throw new Error(`Azure TTS locale is not configured: ${language || "empty"}`);

  const voice = input.voice === "default" ? defaultVoice : input.voice;
  if (!SUPPORTED_VOICES.has(voice) || !voice.startsWith(`${language}-`)) {
    throw new Error(`Azure TTS voice is not allowed for locale ${language}`);
  }

  const speed = Number.isFinite(input.speed) ? Math.min(2, Math.max(0.5, input.speed)) : 1;
  const rate = `${Math.round(speed * 100)}%`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}"><voice name="${voice}"><prosody rate="${rate}">${xmlEscape(input.text)}</prosody></voice></speak>`;
}

export function buildAzureSpeechRequest(input: { key: string; region: string; text: string; language: string; voice: string; speed: number }) {
  const region = input.region.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(region)) throw new Error("Azure Speech region is invalid");
  return {
    url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    init: {
      method: "POST" as const,
      headers: {
        "Ocp-Apim-Subscription-Key": input.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "StudyNova",
      },
      body: buildAzureSsml(input),
    },
  };
}

export function wavDurationMs(data: Uint8Array) {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return 0;

  let byteRate = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt " && chunkSize >= 12 && chunkStart + 12 <= buffer.length) {
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    } else if (chunkId === "data" && byteRate > 0) {
      const available = Math.min(chunkSize, buffer.length - chunkStart);
      return Math.round((available / byteRate) * 1000);
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  return 0;
}
