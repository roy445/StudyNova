import { describe, expect, it } from "vitest";
import { validateOcrImage } from "@/server/ocr-solver";

describe("OCR image validation", () => {
  it("rejects a payload whose bytes do not match its MIME type", () => {
    expect(() => validateOcrImage(Buffer.from("not-an-image"), "image/jpeg")).toThrowError(/圖片檔案無法讀取/);
  });

  it("rejects images larger than the server limit", () => {
    expect(() => validateOcrImage(Buffer.alloc(12 * 1024 * 1024 + 1), "image/png")).toThrowError(/圖片檔案過大/);
  });

  it("accepts a valid PNG signature", () => {
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(128)]);
    expect(() => validateOcrImage(png, "image/png")).not.toThrow();
  });
});
