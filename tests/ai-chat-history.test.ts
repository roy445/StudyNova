import { describe, expect, it } from "vitest";
import { latestConversationMessages, normalizeChatReply } from "@/server/routes/ai-routes";
import { extractJson } from "@/server/ai";

describe("AI chat history window", () => {
  it("keeps the newest 16 messages and restores chronological order", () => {
    const newestFirst = Array.from({ length: 20 }, (_, index) => ({ id: `m-${20 - index}`, createdAt: String(20 - index) }));
    expect(latestConversationMessages(newestFirst).map((item) => item.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `m-${index + 5}`),
    );
  });

  it("normalizes provider reply aliases instead of producing SN-AI-6004", () => {
    expect(normalizeChatReply({ text: "我是 Novi" }, "")).toBe("我是 Novi");
    expect(normalizeChatReply({ content: "我可以陪你學習" }, "")).toBe("我可以陪你學習");
    expect(normalizeChatReply({}, "這是一段純文字回答")).toBe("這是一段純文字回答");
    expect(normalizeChatReply({}, "{\"unexpected\":true}")).toBe("");
    expect(normalizeChatReply({}, "前置說明\n```json\n{\"reply\":\"解析成功\",\"action\":null}\n```\n後置說明")).toBe("解析成功");
    expect(extractJson<{ reply: string }>("前文 {\"reply\":\"第一個完整答案\"} 後文", {} as { reply: string })).toEqual({ reply: "第一個完整答案" });
  });

  it("does not mutate the database result array", () => {
    const rows = [{ id: "new" }, { id: "old" }];
    const result = latestConversationMessages(rows, 2);
    expect(result).toEqual([{ id: "old" }, { id: "new" }]);
    expect(rows).toEqual([{ id: "new" }, { id: "old" }]);
  });
});

