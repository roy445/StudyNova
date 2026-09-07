"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Skeleton, useToast } from "@/components/ui";
import { apiPatch, apiPut, errorMessage, useApi } from "@/lib/api";

type Challenge = { id: string; title: string; kind: string; status: string; expiresAt: string; createdAt: string; creatorName: string; participants: number };
type Settings = { manualOpen?: boolean; minimumWords?: number };

export default function AdminChallengesPage() {
  const toast = useToast();
  const list = useApi<{ challenges: Challenge[] }>("/admin/challenges");
  const settings = useApi<{ settings: Array<{ key: string; value: Record<string, unknown> }> }>("/admin/settings");
  const current = (settings.data?.settings.find((item) => item.key === "challenge_vocabulary_source")?.value ?? {}) as Settings;
  const [minimumWords, setMinimumWords] = useState(100);
  const [manualOpen, setManualOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    if (!settingsReady && settings.data) {
      window.setTimeout(() => {
        setSettingsReady(true);
        setMinimumWords(Math.max(100, Number(current.minimumWords ?? 100)));
        setManualOpen(current.manualOpen === true);
      }, 0);
    }
  }, [current.manualOpen, current.minimumWords, settings.data, settingsReady]);

  async function saveVocabularySetting() {
    try {
      await apiPut("/admin/settings/challenge_vocabulary_source", { value: { minimumWords: Math.max(100, minimumWords), manualOpen } });
      await settings.reload();
      toast.push("success", manualOpen ? "字詞百科題庫已手動開放" : "字詞百科題庫設定已儲存");
    } catch (error) {
      toast.push("error", errorMessage(error));
    }
  }

  async function updateChallenge(id: string, patch: Record<string, unknown>) {
    try {
      await apiPatch(`/admin/challenges/${id}`, patch);
      await list.reload();
      toast.push("success", "挑戰狀態已更新");
    } catch (error) {
      toast.push("error", errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <Card title="⚔️ 挑戰功能管理" subtitle="集中管理所有挑戰、參與狀態與字詞百科題庫開放規則。">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass-soft p-4">
            <p className="font-semibold">字詞百科題庫來源</p>
            <p className="mt-1 text-xs leading-6 text-muted">預設必須累積至少 100 個單字才會開放。若內容已準備完成，管理員可以直接手動開放。</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="最低單字數"><Input type="number" min={100} value={minimumWords} onChange={(event) => setMinimumWords(Number(event.target.value))} /></Field>
              <label className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm"><span>手動開放</span><input type="checkbox" checked={manualOpen} onChange={(event) => setManualOpen(event.target.checked)} className="accent-[#37d3ff]" /></label>
            </div>
            <Button className="mt-3" onClick={() => void saveVocabularySetting()}>儲存題庫開放設定</Button>
          </div>
          <div className="glass-soft p-4 text-sm">
            <p className="font-semibold">挑戰規則</p>
            <p className="mt-2 text-xs leading-6 text-muted">一般模式依題型分配每題秒數，基礎題通常 30 秒；速戰速決模式固定每題 10 秒。逾時會記錄為「未作答」，不會被誤算成答錯後要求確認。</p>
          </div>
        </div>
      </Card>

      <Card title="目前挑戰" subtitle="關閉只停止後續作答，歷史參與紀錄仍會保留。">
        {list.loading && <Skeleton lines={5} />}
        {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
        {!list.loading && !list.data?.challenges.length && <EmptyState icon="⚔️" title="目前沒有挑戰" />}
        <div className="space-y-2">
          {list.data?.challenges.map((challenge) => (
            <div key={challenge.id} className="glass-soft flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{challenge.title}</p>
                <p className="text-xs text-muted">{challenge.kind}・發起人 {challenge.creatorName}・{challenge.participants} 位參與・建立於 {new Date(challenge.createdAt).toLocaleString("zh-TW")}</p>
                <p className="mt-1 text-xs text-muted">截止：{new Date(challenge.expiresAt).toLocaleString("zh-TW")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={challenge.status === "open" ? "green" : challenge.status === "paused" ? "gold" : "muted"}>{challenge.status === "open" ? "開放中" : challenge.status === "paused" ? "已暫停" : "已關閉"}</Badge>
                {challenge.status === "open" && <Button size="sm" variant="ghost" onClick={() => void updateChallenge(challenge.id, { status: "paused" })}>暫停</Button>}
                {challenge.status === "paused" && <Button size="sm" variant="ghost" onClick={() => void updateChallenge(challenge.id, { status: "open" })}>恢復</Button>}
                {challenge.status !== "closed" && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("確定關閉這個挑戰？參與歷史會保留。")) void updateChallenge(challenge.id, { status: "closed" }); }}>關閉</Button>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
