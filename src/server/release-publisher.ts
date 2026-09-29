import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { softwareReleases } from "@/db/schema";
import { APP_VERSION } from "@/lib/app-version";
import { compareSemVer, isValidSemVer } from "@/lib/semver";
import { conflict, forbidden, notFound } from "./core";

function assertVersionMovesForward(publishedRows: Array<{ version: string }>, version: string) {
  const latestPublished = publishedRows.map((row) => row.version).filter(isValidSemVer).sort(compareSemVer).at(-1);
  const floor = latestPublished ?? "0.0.0";
  if (!isValidSemVer(version) || compareSemVer(version, floor) <= 0) {
    throw conflict(`版本 ${version} 必須高於最新已發布版本 ${floor}，不能重複或倒退發布。`);
  }
}

export async function publishReleaseNow(releaseId: string, publishedBy: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('studynova-release-publish-v1'))`);
    const row = (await tx.select().from(softwareReleases).where(eq(softwareReleases.id, releaseId)).limit(1))[0];
    if (!row) throw notFound("找不到版本");
    if (row.status !== "DRAFT" && row.status !== "SCHEDULED") throw conflict("這個版本目前不可發布");
    if (row.status === "SCHEDULED" && row.scheduledAt && row.scheduledAt > now) throw conflict("此版本已排定在未來發布；請先取消排程再立即發布。");
    if (row.version !== APP_VERSION) throw conflict(`目前部署程式為 v${APP_VERSION}，不能發布 v${row.version} 的版本紀錄。請先部署版本號為 v${row.version} 的程式，再發布公告。`);
    if (row.migrationRequired && row.migrationStatus !== "SUCCEEDED") throw forbidden("此版本需要資料庫 migration；請先在線上資料庫完成 migration，並在版本中心記錄成功後才能發布。");
    const publishedRows = await tx.select({ version: softwareReleases.version }).from(softwareReleases).where(eq(softwareReleases.status, "PUBLISHED"));
    assertVersionMovesForward(publishedRows, row.version);
    const updated = (await tx.update(softwareReleases).set({ status: "PUBLISHED", releasedAt: now, publishedBy, scheduledAt: null, updatedAt: now }).where(eq(softwareReleases.id, row.id)).returning())[0];
    if (!updated) throw conflict("版本狀態剛剛已變更，請重新整理後再試。");
    return updated;
  });
}

export async function publishScheduledRelease(releaseId: string, expectedScheduledAt: string) {
  const expected = new Date(expectedScheduledAt);
  if (Number.isNaN(expected.getTime())) throw new Error("release_publish job has invalid scheduledAt");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('studynova-release-publish-v1'))`);
    const row = (await tx.select().from(softwareReleases).where(eq(softwareReleases.id, releaseId)).limit(1))[0];
    if (!row || row.status !== "SCHEDULED" || !row.scheduledAt || row.scheduledAt.getTime() !== expected.getTime()) return "已忽略取消或已更新的舊排程";
    if (row.scheduledAt > new Date()) return "排程尚未到期，等待下一次佇列執行";
    if (row.migrationRequired && row.migrationStatus !== "SUCCEEDED") {
      await tx.update(softwareReleases).set({ status: "DRAFT", scheduledAt: null, updatedAt: new Date() }).where(eq(softwareReleases.id, row.id));
      return "migration 尚未標記成功，已取消自動發布並退回草稿";
    }
    if (row.version !== APP_VERSION) {
      await tx.update(softwareReleases).set({ status: "DRAFT", scheduledAt: null, updatedAt: new Date() }).where(eq(softwareReleases.id, row.id));
      return `目前部署程式為 v${APP_VERSION}，排程版本 v${row.version} 尚未部署；已退回草稿`;
    }
    const rows = await tx.select({ version: softwareReleases.version }).from(softwareReleases).where(eq(softwareReleases.status, "PUBLISHED"));
    const floor = rows.map((item) => item.version).filter(isValidSemVer).sort(compareSemVer).at(-1) ?? "0.0.0";
    if (!isValidSemVer(row.version) || compareSemVer(row.version, floor) <= 0) {
      await tx.update(softwareReleases).set({ status: "DRAFT", scheduledAt: null, updatedAt: new Date() }).where(eq(softwareReleases.id, row.id));
      return `版本號不再高於 ${floor}，已取消自動發布並退回草稿`;
    }
    const publishedAt = new Date();
    const updated = (await tx.update(softwareReleases).set({ status: "PUBLISHED", releasedAt: publishedAt, scheduledAt: null, updatedAt: publishedAt }).where(and(eq(softwareReleases.id, row.id), eq(softwareReleases.status, "SCHEDULED"))).returning({ version: softwareReleases.version }))[0];
    return updated ? `已自動發布 v${updated.version}` : "版本狀態已變更，未發布";
  });
}
