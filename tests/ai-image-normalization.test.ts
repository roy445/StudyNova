import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeAiRequest } from "@/server/ai";

describe("AI image normalization", () => {
  it("converts browser image formats to a normalized JPEG payload", async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 20, g: 120, b: 220 } },
    }).png().toBuffer();
    const result = await normalizeAiRequest({
      feature: "test",
      parts: [{ kind: "image", mimeType: "image/png", base64: png.toString("base64") }],
    });
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toMatchObject({ kind: "image", mimeType: "image/jpeg" });
    const normalized = Buffer.from((result.parts[0] as { base64: string }).base64, "base64");
    expect(normalized.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(normalized.length).toBeGreaterThan(100);
  });

  it("rejects an empty image payload instead of sending invalid base64 to a provider", async () => {
    await expect(normalizeAiRequest({
      feature: "test",
      parts: [{ kind: "image", mimeType: "image/jpeg", base64: "" }],
    })).rejects.toMatchObject({ code: "SN-AI-6002" });
  });
});

