import { describe, expect, it } from "vitest";
import { calculatePkScore, calculateRanks, ensureDifferentOptionOrder, matchPlayerCount, pkOptionOrder, pkQuestionFingerprint } from "@/server/pk-utils";

describe("online PK server rules", () => {
  it("creates a stable but player-specific option order", () => {
    const options = ["A", "B", "C", "D"];
    expect(pkOptionOrder(options, "match-a:player-a:q1")).toEqual(pkOptionOrder(options, "match-a:player-a:q1"));
    const pair = ensureDifferentOptionOrder(options, "match-a:player-a:q1", "match-a:player-b:q1");
    expect(pair.first).toHaveLength(4);
    expect(pair.second).toHaveLength(4);
    expect(new Set(pair.first)).toEqual(new Set(options));
    expect(new Set(pair.second)).toEqual(new Set(options));
  });

  it("does not treat different semantic questions as the same fingerprint", () => {
    const base = { type: "single", stem: "Choose the word.", options: ["run", "walk", "jump", "sit"], answer: "run", subject: "英文" };
    expect(pkQuestionFingerprint(base)).toBe(pkQuestionFingerprint({ ...base }));
    expect(pkQuestionFingerprint({ ...base, answer: "walk" })).not.toBe(pkQuestionFingerprint(base));
  });

  it("awards speed and combo points only for correct answers", () => {
    expect(calculatePkScore({ correct: true, elapsedMs: 5000, comboBefore: 0, questionTimeSec: 30 })).toEqual({ points: 350, combo: 1 });
    expect(calculatePkScore({ correct: true, elapsedMs: 5000, comboBefore: 2, questionTimeSec: 30 })).toEqual({ points: 360, combo: 3 });
    expect(calculatePkScore({ correct: false, elapsedMs: 100, comboBefore: 8, questionTimeSec: 30 })).toEqual({ points: 0, combo: 0 });
  });

  it("uses score, correct count, then response time as a deterministic tie-break", () => {
    const result = calculateRanks([
      { id: "slow", score: 100, answeredCount: 2, totalResponseMs: 900 },
      { id: "fast", score: 100, answeredCount: 2, totalResponseMs: 700 },
      { id: "fewer", score: 100, answeredCount: 1, totalResponseMs: 100 },
    ]);
    expect(result.map((item) => item.player.id)).toEqual(["fast", "slow", "fewer"]);
    expect(result.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("keeps supported match sizes bounded", () => {
    expect(matchPlayerCount("1v1")).toBe(2);
    expect(matchPlayerCount("2v2")).toBe(4);
    expect(matchPlayerCount("多人", 100)).toBe(12);
    expect(matchPlayerCount("多人", 1)).toBe(3);
  });
});
