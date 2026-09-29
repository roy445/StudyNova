import { describe, expect, it } from "vitest";
import { buildAzureSpeechRequest, buildAzureSsml, wavDurationMs } from "@/server/azure-tts-utils";

describe("Azure TTS helpers", () => {
  it("escapes course text and selects the Taiwan Mandarin neural voice", () => {
    const ssml = buildAzureSsml({ text: "A & B <課文>", language: "zh-TW", voice: "default", speed: 1.25 });
    expect(ssml).toContain('xml:lang="zh-TW"');
    expect(ssml).toContain('name="zh-TW-HsiaoChenNeural"');
    expect(ssml).toContain('rate="125%"');
    expect(ssml).toContain("A &amp; B &lt;課文&gt;");
  });

  it("supports Russian and rejects unknown or cross-locale voices", () => {
    expect(buildAzureSsml({ text: "Привет", language: "ru-RU", voice: "default", speed: 1 })).toContain("ru-RU-SvetlanaNeural");
    expect(() => buildAzureSsml({ text: "text", language: "xx-XX", voice: "default", speed: 1 })).toThrow("locale is not configured");
    expect(() => buildAzureSsml({ text: "text", language: "zh-TW", voice: "en-US-JennyNeural", speed: 1 })).toThrow("voice is not allowed");
  });

  it("builds the documented regional REST request with the server-only subscription-key header", () => {
    const request = buildAzureSpeechRequest({ key: "secret-test-key", region: "EastAsia", text: "課文", language: "zh-TW", voice: "default", speed: 1 });
    expect(request.url).toBe("https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(request.init.headers["Ocp-Apim-Subscription-Key"]).toBe("secret-test-key");
    expect(Object.keys(request.init.headers)).not.toContain("Authorization");
    expect(request.init.headers["X-Microsoft-OutputFormat"]).toBe("riff-24khz-16bit-mono-pcm");
    expect(request.init.body).toContain("課文");
    expect(() => buildAzureSpeechRequest({ key: "k", region: "https://evil.test", text: "x", language: "zh-TW", voice: "default", speed: 1 })).toThrow("region is invalid");
  });

  it("reads duration from a RIFF WAV data chunk", () => {
    const dataBytes = 4_410;
    const wav = Buffer.alloc(44 + dataBytes);
    wav.write("RIFF", 0, "ascii");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVE", 8, "ascii");
    wav.write("fmt ", 12, "ascii");
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(22_050, 24);
    wav.writeUInt32LE(44_100, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36, "ascii");
    wav.writeUInt32LE(dataBytes, 40);
    expect(wavDurationMs(wav)).toBe(100);
    expect(wavDurationMs(Buffer.from("not audio"))).toBe(0);
  });
});
