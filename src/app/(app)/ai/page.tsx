"use client";

import { useEffect, useRef, useState } from "react";
import { NoviAvatar, type NoviState } from "@/components/brand";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";
import { NovaCostNotice, confirmNovaSpend } from "@/components/NovaCostNotice";

type Conversation = { id: string; title: string; mode: string; archived: boolean; allowContext: string[]; contextMaterialId: string | null; updatedAt: string };
type Message = { id: string; conversationId?: string; role: string; content: string; attachment?: { name: string; previewUrl: string }; importance?: "normal" | "important" | "critical" | string; action: { type: string; preview?: string; payload?: Record<string, unknown> } | null; actionStatus: string; createdAt: string };
type FileContext = { id: string; originalName: string; status: string; detected: Array<{ kind: string; text: string; confidence: number }>; error: string; uploadBatch: number };
type MemoryItem = { id: string; key: string; value: string; scope?: string; confidence?: number; consentStatus?: string; updatedAt?: string };

const MODES = [
  { key: "teacher", label: "學習教練模式", description: "陪你規劃學習、拆解觀念與建立可執行的下一步。" },
  { key: "solve", label: "解題模式", description: "一步一步分析題目，不直接跳到答案。" },
  { key: "hint", label: "提示模式", description: "只給剛剛好的提示，保留你自己思考的空間。" },
  { key: "exam", label: "考試模式", description: "用考試節奏練習，先作答再看解析。" },
  { key: "note", label: "筆記模式", description: "把重點整理成清楚、可複習的筆記。" },
  { key: "wrong", label: "錯題模式", description: "找出錯題背後的觀念漏洞，安排補強。" },
  { key: "review", label: "複習模式", description: "依照記憶曲線幫你回顧最容易忘記的內容。" },
  { key: "quick", label: "快速模式", description: "用最短的回答，快速處理一個明確問題。" },
];

const CONTEXT_OPTIONS = [
  { key: "settings", label: "學習設定" },
  { key: "grades", label: "成績" },
  { key: "wrong", label: "錯題" },
  { key: "plan", label: "讀書計畫" },
  { key: "tasks", label: "待辦" },
  { key: "materials", label: "指定教材" },
];
const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];

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
  const memory = useApi<{ memory: MemoryItem[]; memoryEnabled?: boolean }>("/ai/memory");
  const quotas = useApi<{ quotas: Array<{ feature: string; novaCost: number }> }>("/quotas");
  const contexts = useApi<{ contexts: FileContext[] }>("/ai/solution/contexts");
  const aiContextCost = quotas.data?.quotas.find((item) => item.feature === "ai_context")?.novaCost ?? null;
  const aiPracticeCost = quotas.data?.quotas.find((item) => item.feature === "ai_practice")?.novaCost ?? null;
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
  const [uploading, setUploading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ value: number; label: string } | null>(null);
  const [attachment, setAttachment] = useState<{ contextId: string; name: string; previewUrl: string } | null>(null);
  const [attachmentSubject, setAttachmentSubject] = useState("");
  const [solutionResult, setSolutionResult] = useState<{ reply?: string; hint?: string; steps?: string[]; answer?: string; needsCrop?: boolean; mode?: string } | null>(null);
  const [scope, setScope] = useState({ includeQuestion: true, includeHandwriting: true, includeNote: true, highlightPriority: false });
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const activeMode = MODES.find((mode) => mode.key === (conv?.mode ?? "teacher")) ?? MODES[0];

  useEffect(() => {
    if (!activeId) return;
    const loadingTimer = window.setTimeout(() => setLoadingMsg(true), 0);
    apiGet<{ conversation: Conversation; messages: Message[] }>(`/ai/conversations/${activeId}`)
      .then((res) => {
        setLoadingMsg(false);
        setConv(res.conversation);
        setMessages(res.messages);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => {
        window.clearTimeout(loadingTimer);
        setLoadingMsg(false);
      });
    return () => window.clearTimeout(loadingTimer);
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
    if (!activeId || (!input.trim() && !attachment)) return;
    const content = input.trim();
    if (!confirmNovaSpend("Novi 回覆", aiContextCost)) return;
    setInput("");
    const sentAttachment = attachment;
    setAttachment(null);
    setSending(true);
    setNoviState("thinking");
    setError(null);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: content || "請分析這張圖片。", attachment: sentAttachment ?? undefined, action: null, actionStatus: "none", createdAt: new Date().toISOString() }]);
    try {
      const res = await apiPost<{ message: Message }>(`/ai/conversations/${activeId}/messages`, { content: content || "請分析這張圖片。", contextId: sentAttachment?.contextId });
      setMessages((m) => [...m, res.message]);
      setNoviState("happy");
      await convs.reload();
    } catch (err) {
      setNoviState("error");
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function uploadAndAnalyze(files: FileList | null) {
    if (!files?.length || uploading) return;
    if (!attachmentSubject) {
      toast.push("info", "請先選擇圖片科目，再加入對話");
      return;
    }
    setUploading(true);
    setAnalysisProgress({ value: 8, label: "準備檔案…" });
    setError(null);
    try {
      const form = new FormData();
      setAnalysisProgress({ value: 20, label: "上傳檔案中…" });
      Array.from(files).slice(0, 8).forEach((file) => form.append("files", file));
      form.append("subject", attachmentSubject);
      Object.entries(scope).forEach(([key, value]) => form.append(key, String(value)));
      const uploaded = await apiPost<{ results: Array<{ context: FileContext | null; duplicate: boolean; errorCode?: string; error?: string }>; newCount: number; duplicateCount: number }>("/ai/solution/upload", form);
      setAnalysisProgress({ value: 52, label: "圖片已加入對話，請輸入你的需求…" });
      const failed = uploaded.results.filter((item) => !item.context);
      if (failed.length) setError(failed.map((item) => `${item.error ?? "圖片分析失敗"}（${item.errorCode ?? "SN-SYS-9901"}）`).join("；"));
      const first = uploaded.results.find((item) => item.context);
      if (!first?.context) throw new Error(failed.length ? "圖片分析失敗，請依畫面上的錯誤代碼回報。" : "找不到上傳的圖片。");
      setAttachment({ contextId: first.context.id, name: first.context.originalName, previewUrl: URL.createObjectURL(files[0]) });
      toast.push("success", uploaded.duplicateCount ? "已加入對話並重用既有圖片分析" : "圖片已加入對話");
      await contexts.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      setAnalysisProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function resolveAction(messageId: string, confirm: boolean) {
    const action = messages.find((item) => item.id === messageId)?.action;
    if (confirm && action?.type === "create_quiz" && !confirmNovaSpend("Novi 建立測驗", aiPracticeCost)) return;
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
          {!convs.loading && !convs.data?.conversations.length && <EmptyState icon="◌" title="還沒有對話" hint="建立一個對話開始問 Novi。" />}
        </div>
        <Button size="sm" variant="ghost" className="mt-2" full onClick={() => setShowMemory(true)}>
          ✦ Novi 記憶（{memory.data?.memory.length ?? 0}）
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
              <Badge tone="cyan">目前：{activeMode.label}</Badge>
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
            <div className="mb-3 rounded-xl border border-[#7c5cff]/25 bg-[#7c5cff]/8 px-3 py-2 text-xs leading-5 text-muted"><span className="font-semibold text-[#c4b5fd]">{activeMode.label}的用途：</span> {activeMode.description}</div>

            <div className="flex-1 space-y-3 overflow-y-auto scroll-thin pr-1">
              {loadingMsg && <Skeleton lines={4} />}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] text-white" : m.importance === "critical" ? "border-rose-300/60 bg-rose-400/15 text-rose-50 shadow-[0_0_24px_rgba(251,113,133,0.14)]" : m.importance === "important" ? "border-amber-300/50 bg-amber-400/12 text-amber-50" : "glass-soft border-transparent"}`}>
                    {m.attachment && <img src={m.attachment.previewUrl} alt={m.attachment.name} className="mb-2 max-h-64 max-w-full rounded-xl object-contain" />}
                    {m.role !== "user" && m.importance && m.importance !== "normal" && <p className={`mb-1 text-[10px] font-bold tracking-wide ${m.importance === "critical" ? "text-rose-200" : "text-amber-200"}`}>{m.importance === "critical" ? "⚠ 關鍵提醒" : "✦ 學習重點"}</p>}
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                    {m.action && (
                      <div className="mt-2 rounded-xl border border-[#ffc857]/40 bg-[#ffc857]/10 p-2.5 text-xs">
                        <p className="font-medium text-[#ffd98a]">✦ Novi 想要：{ACTION_LABEL[m.action.type] ?? m.action.type} {m.action.type === "create_note" && <Badge tone="gold">Nova Pro 專屬</Badge>}</p>
                        {m.action.type === "create_note" && <p className="mt-0.5 text-[11px] text-amber-100/80">AI 建立筆記需要有效的 Nova Pro 資格，系統會在執行時再次驗證。</p>}
                        {m.action.type === "create_quiz" && <NovaCostNotice cost={aiPracticeCost} action="Novi 建立測驗" className="mt-2" />}
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

            <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
              <input ref={fileInput} type="file" accept="image/*,.pdf" multiple hidden onChange={(e) => void uploadAndAnalyze(e.target.files)} />
              {attachment && <div className="flex items-center gap-2 rounded-xl border border-[#37d3ff]/40 bg-[#37d3ff]/5 p-2"><img src={attachment.previewUrl} alt={attachment.name} className="h-14 w-14 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-xs">{attachment.name}<span className="block text-[10px] text-[#b9f2ff]">已加入對話，輸入需求後送出</span></span><button type="button" className="text-xs text-muted" onClick={() => { URL.revokeObjectURL(attachment.previewUrl); setAttachment(null); }}>移除</button></div>}
              {analysisProgress && <div className="rounded-xl border border-[#37d3ff]/30 bg-[#37d3ff]/5 px-3 py-2"><div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-[#b9f2ff]">{analysisProgress.label}</span><span className="text-muted">{analysisProgress.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-gradient-to-r from-[#37d3ff] to-[#7c5cff] transition-all duration-500" style={{ width: `${analysisProgress.value}%` }} /></div><p className="mt-1 text-[10px] text-muted">你可以切換其他功能，分析會在背景完成；完成後回到 Novi 即可查看。</p></div>}
              {solutionResult && (
                <div className="rounded-xl border border-[#37d3ff]/30 bg-[#37d3ff]/8 px-3 py-2 text-xs leading-5">
                  <div className="mb-1 flex items-center justify-between"><span className="font-semibold text-[#7dd3fc]">共用 AI 分析 · {solutionResult.mode ?? "tutor"}{solutionResult.needsCrop ? " · 請裁切成單題" : ""}</span><button className="text-muted" onClick={() => setSolutionResult(null)}>關閉</button></div>
                  {solutionResult.reply && <p>{solutionResult.reply}</p>}
                  {solutionResult.hint && <p className="mt-1 text-amber-200">提示：{solutionResult.hint}</p>}
                  {!!solutionResult.steps?.length && <ol className="mt-1 list-decimal pl-5">{solutionResult.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol>}
                </div>
              )}
              <NovaCostNotice cost={aiContextCost} action="Novi 回覆" />
              <div className="flex items-end gap-2">
              <select value={attachmentSubject} onChange={(e) => setAttachmentSubject(e.target.value)} className="h-10 rounded-xl border border-[var(--line)] bg-black/20 px-2 text-xs" aria-label="附件科目">
                <option value="">先選科目</option>
                {SUBJECTS.map((subject) => <option key={subject}>{subject}</option>)}
              </select>
              <Button size="sm" variant="outline" loading={uploading} onClick={() => fileInput.current?.click()} title="加入圖片或檔案">＋</Button>
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
              <Button loading={sending} onClick={send} disabled={!input.trim() && !attachment}>
                送出
              </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={showMemory} onClose={() => setShowMemory(false)} title="Novi 長期記憶">
        <div className="mb-3 space-y-2 text-xs text-muted">
          <p>Novi 只會使用狀態為「啟用」且尚未過期的記憶。你可以查看來源、信心、暫停全部記憶，或匯出後自行保存。</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await apiPost("/ai/memory/settings", { enabled: !memory.data?.memoryEnabled });
                await memory.reload();
              }}
            >
              {memory.data?.memoryEnabled ? "暫停全部記憶" : "恢復全部記憶"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const result = await apiGet<{ exportedAt: string; memory: MemoryItem[] }>("/ai/memory/export");
                const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "novi-memory-export.json";
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              匯出記憶
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          {memory.data?.memory.map((m) => (
            <div key={m.id} className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{m.key}</span>：<span className="text-muted">{m.value}</span>
                <span className="mt-1 block text-[10px] text-muted">{m.scope ?? "profile"} · 信心 {m.confidence ?? 50}% · {m.consentStatus === "paused" ? "已暫停" : "啟用中"}</span>
              </span>
              <button
                onClick={async () => {
                  await apiDelete(`/ai/memory/${m.id}`);
                  await memory.reload();
                }}
                className="shrink-0 text-rose-300"
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
