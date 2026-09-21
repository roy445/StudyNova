import { describe, expect, it } from "vitest";
import { checkNaturalExample } from "../src/server/vocabulary-quality";

describe("natural vocabulary examples", () => {
  it("accepts a real usage sentence", () => {
    expect(checkNaturalExample("Don't hesitate to ask me if you need any help.", "hesitate").valid).toBe(true);
  });

  it("rejects passage-analysis templates", () => {
    const result = checkNaturalExample("In the passage, the word abortion helps explain the writer's main idea.", "abortion");
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("模板");
  });

  it("requires the target word", () => {
    expect(checkNaturalExample("Please wait outside the office.", "hesitate").valid).toBe(false);
  });
});
