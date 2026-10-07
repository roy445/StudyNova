import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AI conversation attachment deletion contract", () => {
  it("registers an authenticated conversation attachment DELETE endpoint", async () => {
    const source = await readFile("src/server/routes/ai-routes.ts", "utf8");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain('path: "/ai/conversations/:id/attachments/:contextId"');
    expect(source).toContain('auth: "user"');
  });

  it("removes the persistent link and deletes an unshared file context and object", async () => {
    const source = await readFile("src/server/routes/ai-routes.ts", "utf8");
    expect(source).toMatch(/tx\s*\.delete\(aiConversationFileContexts\)/);
    expect(source).toMatch(/tx\s*\.delete\(fileContexts\)/);
    expect(source).toContain("deleteObject(objectId, user.userId, false)");
  });

  it("does not only remove the attachment from local React state", async () => {
    const source = await readFile("src/app/(app)/ai/page.tsx", "utf8");
    expect(source).toContain("/attachments/${contextId}");
    expect(source).toContain('檔案已從聊天室永久刪除');
  });
});
