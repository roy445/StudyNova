import { beforeEach, describe, expect, it, vi } from "vitest";

const { analyzeSolution } = vi.hoisted(() => ({ analyzeSolution: vi.fn() }));
vi.mock("@/server/unified-ai-engine", () => ({
  analyzeSolution,
  createFileContext: vi.fn(),
}));

import { routes } from "@/server/routes/ai-routes";

describe("POST /api/v1/ai/solution/analyze contract", () => {
  beforeEach(() => analyzeSolution.mockReset());

  it("returns the unified engine success payload for a valid authenticated request", async () => {
    const result = { session: { id: "session-1", status: "completed", charged: true }, result: { reply: "解析完成" } };
    analyzeSolution.mockResolvedValue(result);
    const route = routes.find((item) => item.path === "/ai/solution/analyze" && item.method === "POST") as any;
    const response = await route.handler({
      requireUser: () => ({ userId: "user-1" }),
      json: async () => ({ contextIds: ["00000000-0000-0000-0000-000000000001"], mode: "solution", idempotencyKey: "request-1" }),
    });
    expect(response).toEqual(result);
    expect(analyzeSolution).toHaveBeenCalledWith({
      userId: "user-1",
      contextIds: ["00000000-0000-0000-0000-000000000001"],
      requestedMode: "solution",
      idempotencyKey: "request-1",
      scope: undefined,
    });
  });
});
