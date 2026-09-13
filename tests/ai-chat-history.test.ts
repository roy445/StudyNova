import { describe, expect, it } from "vitest";
import { latestConversationMessages } from "@/server/routes/ai-routes";

describe("AI chat history window", () => {
  it("keeps the newest 16 messages and restores chronological order", () => {
    const newestFirst = Array.from({ length: 20 }, (_, index) => ({ id: `m-${20 - index}`, createdAt: String(20 - index) }));
    expect(latestConversationMessages(newestFirst).map((item) => item.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `m-${index + 5}`),
    );
  });

  it("does not mutate the database result array", () => {
    const rows = [{ id: "new" }, { id: "old" }];
    const result = latestConversationMessages(rows, 2);
    expect(result).toEqual([{ id: "old" }, { id: "new" }]);
    expect(rows).toEqual([{ id: "new" }, { id: "old" }]);
  });
});

