import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "src/server/routes/video-learning-routes.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "drizzle/0141_learning_video.sql"), "utf8");

describe("影片學習安全契約", () => {
  it("所有影片學生端 API 都要求登入，且串流不提供下載 disposition", () => {
    expect(route).toContain('path: "/learning/videos", auth: "user"');
    expect(route).toContain('path: "/learning/videos/:id/stream", auth: "user"');
    expect(route).toContain('"Content-Disposition": "inline"');
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).not.toContain('"Content-Disposition": "attachment"');
  });

  it("試看碼流程綁定指定影片、期限與使用次數，並寫入授權與兌換紀錄", () => {
    expect(route).toContain("learningVideoTrialCodes.videoId");
    expect(route).toContain("trial.expiresAt");
    expect(route).toContain("trial.usedCount >= trial.maxUses");
    expect(route).toContain("learningVideoRedemptions");
    expect(route).toContain("learningVideoAuthorizations");
  });

  it("migration 建立 private 影片所需的完整關聯資料表", () => {
    for (const table of ["learning_videos", "learning_video_trial_codes", "learning_video_redemptions", "learning_video_authorizations", "learning_video_watch_logs"]) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \"${table}\"`);
    expect(migration).toContain('"pro_only" boolean NOT NULL DEFAULT true');
    expect(migration).toContain('UNIQUE ("user_id", "video_id")');
  });
});
