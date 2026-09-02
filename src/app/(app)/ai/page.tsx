"use client";

import { useEffect, useRef, useState } from "react";
import { NoviAvatar, type NoviState } from "@/components/brand";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

type Conversation = { id: string; title: string; mode: string; archived: boolean; allowContext: string[]; contextMaterialId: string | null; updatedAt: string };
type Message = { id: string; role: string; content: string; provider: string; model: string; action: { type: string; preview?: string; payload?: Record<string, unknown> } | null; actionStatus: string; createdAt: string };

const MODES = [
  { key: "teacher", label: "老師模式" },
  { key: "solve", label: "解題模式" },
  { key: "hint", label: "提示模式" },
  { key: "exam", label: "考試模式" },
  { key: "note", label: "筆記模式" },
  { key: "wrong", label: "錯題模式" },
  { key: "review", label: "複習模式" },
  { key: "quick", label: "快速模式" },
];

const CONTEXT_OPTIONS = [
  { key: "settings", label: "學習設定" },
  { key: "grades", label: "成績" },
  { key: "wrong", label: "錯題" },
  { key: "plan", label: "讀書計畫" },
  { key: "tasks", label: "待辦" },
  { key: "materials", label: "指定教材" },
];

const ACTION_LABEL: Record<string, string> = {
  create_task: "建立任務",
  create_note: "建立筆記",
  create_quiz: "建立測驗",
  update_plan: "修改今日讀書計畫",
};

export default function AiPage() {
  const toast = useToast();
  const convs = useApi<{ conversations: Conversation[]; aiEnabled: boolean }>("/ai/conversations");
  const materials = useApi<{ materials: Array<{ id: string; title: string }> }>("/materials");
  const memory = useApi<{ memory: Array<{ id: string; key: string; value: string }> }>("/ai/memory");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noviState, setNoviState] = useState<NoviState>("idle");
  const [showMemory, setShowMemory] = useState(false);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [renameText, setRenameText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId) return;
    setLoadingMsg(true);
    apiGet<{ conversation: Conversation; messages: Message[] }>(`/ai/conversations/${activeId}`)
      .then((res) => {
        setConv(res.conversation);
        setMessages(res.messages);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoadingMsg(false));
  }, [activeId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function createConversation() {
    try {
      const res = await apiPost<{ conversation: Conversation }>("/ai/conversations", { mode: "teacher", allowContext: ["settings", "grades", "wrong", "plan"] });
      await convs.reload();
      setActiveId(res.conversation.id);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  async function send() {
    if (!activeId || !input.trim()) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setNoviState("thinking");
    setError(null);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content, provider: "", model: "", action: null, actionStatus: "none", createdAt: new Date().toISOString() }]);
    try {
      const res = await apiPost<{ message: Message; provider: string; fallbackFrom: string }>(`/ai/conversations/${activeId}/messages`, { content });
      setMessages((m) => [...m, res.message]);
      setNoviState("happy");
      if (res.fallbackFrom) toast.push("info", `主要 AI 忙碌，已自動切換到 ${res.provider}`);
      await convs.reload();
    } catch (err) {
      setNoviState("error");
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function resolveAction(messageId: string, confirm: boolean) {
    try {
      await apiPost(`/ai/messages/${messageId}/action`, { confirm });
      setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, actionStatus: confirm ? "applied" : "rejected" } : x)));
      toast.push("success", confirm ? "已套用 Novi 的建議" : "已拒絕這個建議");
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card
        title="對話"
        action={
          <Button size="sm" onClick={createConversation}>
            ＋ 新對話
          </Button>
        }
        className="lg:sticky lg:top-20 lg:h-fit"
      >
        {convs.loading && <Skeleton lines={3} />}
        {convs.error && <ErrorState message={convs.error} onRetry={convs.reload} />}
        {!convs.data?.aiEnabled && <p className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">AI 尚未設定 API Key，請聯絡管理員。</p>}
        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto scroll-thin lg:max-h-[60vh]">
          {convs.data?.conversations.filter((c) => !c.archived).map((c) => (
            <div key={c.id} className={`glass-soft flex items-center gap-1 px-2 py-2 text-sm ${activeId === c.id ? "border border-[#37d3ff]/50" : ""}`}>
              <button onClick={() => setActiveId(c.id)} className="min-w-0 flex-1 truncate text-left">
                {c.title}
              </button>
              <button onClick={() => { setRenaming(c); setRenameText(c.title); }} className="px-1 text-xs text-muted hover:text-[var(--text)]" title="重新命名">
                ✎
              </button>
              <button
                onClick={async () => {
                  await apiPatch(`/ai/conversations/${c.id}`, { archived: true });
                  await convs.reload();
                }}
                className="px-1 text-xs text-muted hover:text-[var(--text)]"
                title="封存"
              >
                🗄
              </button>
              <button
                onClick={async () => {
                  if (!confirm("刪除這個對話？")) return;
                  await apiDelete(`/ai/conversations/${c.id}`);
                  if (activeId === c.id) setActiveId(null);
                  await convs.reload();
                }}
                className="px-1 text-xs text-muted hover:text-rose-300"
                title="刪除"
              >
                ✕
              </button>
            </div>
          ))}
          {!convs.loading && !convs.data?.conversations.length && <EmptyState icon="💭" title="還沒有對話" hint="建立一個對話開始問 Novi。" />}
        </div>
        <Button size="sm" variant="ghost" className="mt-2" full onClick={() => setShowMemory(true)}>
          🧠 Novi 記憶（{memory.data?.memory.length ?? 0}）
        </Button>
      </Card>

      <Card className="flex min-h-[70dvh] flex-col">
        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
            <NoviAvatar size={100} state="idle" />
            <p className="text-sm font-medium">選擇左側對話，或建立新對話</p>
            <p className="max-w-sm text-xs text-muted">Novi 支援八種模式，並且只有在你授權後才會讀取成績、錯題、計畫等資料。任何要寫入資料的動作都需要你按下確認。</p>
            <Button onClick={createConversation}>開始新對話</Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-3">
              <NoviAvatar size={44} state={sending ? "thinking" : noviState} />
              <Select
                value={conv?.mode ?? "teacher"}
                onChange={async (e) => {
                  await apiPatch(`/ai/conversations/${activeId}`, { mode: e.target.value });
                  setConv((c) => (c ? { ...c, mode: e.target.value } : c));
                }}
                className="!w-auto !py-1.5 text-xs"
              >
                {MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Select
                value={conv?.contextMaterialId ?? ""}
                onChange={async (e) => {
                  const v = e.target.value || null;
                  await apiPatch(`/ai/conversations/${activeId}`, { contextMaterialId: v });
                  setConv((c) => (c ? { ...c, contextMaterialId: v } : c));
                }}
                className="!w-auto !py-1.5 text-xs"
              >
                <option value="">不使用教材</option>
                {materials.data?.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-1">
                {CONTEXT_OPTIONS.map((o) => {
                  const on = conv?.allowContext.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      onClick={async () => {
                        const next = on ? (conv?.allowContext ?? []).filter((x) => x !== o.key) : [...(conv?.allowContext ?? []), o.key];
                        await apiPatch(`/ai/conversations/${activeId}`, { allowContext: next });
                        setConv((c) => (c ? { ...c, allowContext: next } : c));
                      }}
                      className={`rounded-lg border px-2 py-1 text-[11px] ${on ? "border-[#37d3ff] bg-[#37d3ff]/15 text-[#7dd3fc]" : "border-[var(--line)] text-muted"}`}
                      title="授權 Novi 讀取這類資料"
                    >
                      {on ? "✓ " : ""}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto scroll-thin pr-1">
              {loadingMsg && <Skeleton lines={4} />}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] text-white" : "glass-soft"}`}>
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                    {m.role === "assistant" && m.provider && (
                      <p className="mt-1 text-[10px] opacity-60">
                        {m.provider} · {m.model}
                      </p>
                    )}
                    {m.action && (
                      <div className="mt-2 rounded-xl border border-[#ffc857]/40 bg-[#ffc857]/10 p-2.5 text-xs">
                        <p className="font-medium text-[#ffd98a]">🤖 Novi 想要：{ACTION_LABEL[m.action.type] ?? m.action.type}</p>
                        {m.action.preview && <p className="mt-0.5 text-muted">{m.action.preview}</p>}
                        <pre className="mt-1 max-h-28 overflow-y-auto scroll-thin whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[10px]">{JSON.stringify(m.action.payload ?? {}, null, 2)}</pre>
                        {m.actionStatus === "pending" ? (
                          <div className="mt-2 flex gap-1.5">
                            <Button size="sm" onClick={() => resolveAction(m.id, true)}>
                              確認執行
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => resolveAction(m.id, false)}>
                              拒絕
                            </Button>
                          </div>
                        ) : (
                          <Badge tone={m.actionStatus === "applied" ? "green" : "muted"}>{m.actionStatus === "applied" ? "已套用" : "已拒絕"}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 animate-ping rounded-full bg-[#37d3ff]" /> Novi 思考中…
                </div>
              )}
              {error && <ErrorState message={error} onRetry={() => setError(null)} />}
              <div ref={bottom} />
            </div>

            <div className="mt-3 flex gap-2 border-t border-[var(--line)] pt-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="問 Novi 任何學習問題…"
                disabled={sending}
              />
              <Button loading={sending} onClick={send} disabled={!input.trim()}>
                送出
              </Button>
            </div>
          </>
        )}
      </Card>

      <Modal open={showMemory} onClose={() => setShowMemory(false)} title="Novi 長期記憶">
        <p className="mb-2 text-xs text-muted">Novi 會記住你的學習偏好與弱點，你可以隨時刪除。</p>
        <div className="space-y-1.5">
          {memory.data?.memory.map((m) => (
            <div key={m.id} className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{m.key}</span>：<span className="text-muted">{m.value}</span>
              </span>
              <button
                onClick={async () => {
                  await apiDelete(`/ai/memory/${m.id}`);
                  await memory.reload();
                }}
                className="text-rose-300"
              >
                刪除
              </button>
            </div>
          ))}
          {!memory.data?.memory.length && <EmptyState icon="🧠" title="還沒有記憶" hint="多和 Novi 聊聊，它會記住重要資訊。" />}
        </div>
      </Modal>

      <Modal open={Boolean(renaming)} onClose={() => setRenaming(null)} title="重新命名對話">
        <Field label="名稱">
          <Input value={renameText} onChange={(e) => setRenameText(e.target.value)} />
        </Field>
        <Button
          className="mt-3"
          full
          onClick={async () => {
            if (!renaming) return;
            await apiPatch(`/ai/conversations/${renaming.id}`, { title: renameText });
            setRenaming(null);
            await convs.reload();
          }}
        >
          儲存
        </Button>
      </Modal>
    </div>
  );
}
