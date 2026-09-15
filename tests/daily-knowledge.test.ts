import { describe, expect, it } from "vitest";
import { compareDailyKnowledge, fingerprint } from "../src/server/daily-knowledge";

describe("daily knowledge novelty gate", () => {
  it("rejects paraphrased titles and shared concepts", () => {
    const result = compareDailyKnowledge({ title: "為什麼天空呈現藍色", content: "大氣中的粒子會散射短波長光。", coreConcept: "瑞利散射造成天空顏色" }, [{ title: "為什麼天空是藍色", content: "太陽光經過大氣時短波長散射較強。", coreConcept: "瑞利散射造成天空顏色" }]);
    expect(result.duplicate).toBe(true);
    expect(result.highest.coreConcept).toBeGreaterThanOrEqual(0.7);
  });
  it("creates stable fingerprints for normalization", () => {
    expect(fingerprint("  A fact! ")).toBe(fingerprint("a fact"));
  });
});
