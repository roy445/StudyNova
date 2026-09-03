"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";

const SUBJECTS = ["國文", "英文", "數學", "自然", "社會", "理化", "生物", "歷史", "地理", "公民", "其他"];

type Material = { id: string; title: string; subject: string; kind: string; status: string; summary: string; content: string; tags: string[]; createdAt: string; visibility: string };

export function MaterialsPanel() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ materials: Material[] }>("/materials");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("英文");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<Material | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function upload() {
    if (!title.trim()) {
      toast.push("error", "請輸入教材標題");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("subject", subject);
      fd.append("content", content);
      if (file) fd.append("file", file);
      await apiPost("/materials", fd);
      toast.push("success", "教材已上傳並完成文字擷取");
      setOpen(false);
      setTitle("");
      setContent("");
      setFile(null);
      await reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function analyze(m: Material) {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await apiPost<{ analysis: Record<string, unknown> }>(`/materials/${m.id}/analyze`);
      setAnalysis(res.analysis);
      toast.push("success", "AI 整理完成，已同步建立筆記");
      await reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <Card
      title="📚 我的教材"
      subtitle="支援 PDF、TXT、圖片與直接貼上文字，上傳後可讓 AI 整理重點、單字與題目"
      action={<Button size="sm" onClick={() => setOpen(true)}>＋ 新增教材</Button>}
    >
      {loading && <Skeleton lines={4} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !data?.materials.length && <EmptyState icon="📁" title="還沒有教材" hint="上傳課本講義 PDF 或貼上文字，AI 就能幫你整理。" />}

      <div className="max-h-[70vh] grid gap-2 overflow-y-auto overscroll-contain scroll-thin pr-1 touch-pan-y sm:grid-cols-2">
        {data?.materials.map((m) => (
          <div key={m.id} className="glass-soft solid-data-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.title}</p>
                <p className="text-[11px] text-muted">
                  {m.subject}・{m.kind.toUpperCase()}・{new Date(m.createdAt).toLocaleDateString("zh-TW")}
                </p>
              </div>
              <Badge tone={m.status === "ready" ? "green" : m.status === "failed" ? "rose" : "cyan"}>{m.status}</Badge>
            </div>
            {m.summary && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{m.summary}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => { setDetail(m); setAnalysis(null); }}>
                查看
              </Button>
              <Button size="sm" variant="ghost" onClick={() => analyze(m)}>
                AI 整理
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`確定刪除教材「${m.title}」？`)) return;
                  await apiDelete(`/materials/${m.id}`);
                  toast.push("success", "已刪除");
                  await reload();
                }}
              >
                刪除
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="新增教材">
        <div className="space-y-3">
          <Field label="標題" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：英文 B3 L2 單字表" />
          </Field>
          <Field label="科目">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="檔案（PDF / TXT / 圖片）" hint="圖片與 PDF 會使用 AI 進行文字擷取，會消耗「教材整理」額度">
            <input
              type="file"
              accept=".pdf,.txt,.md,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-xs"
            />
          </Field>
          <Field label="或直接貼上教材文字">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="貼上課文、講義內容…" />
          </Field>
          <Button full loading={uploading} onClick={upload}>
            上傳並處理
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.title ?? ""} wide>
        {detail && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="cyan">{detail.subject}</Badge>
              <Badge tone="muted">{detail.kind}</Badge>
              {detail.tags.map((t) => (
                <Badge key={t} tone="violet">
                  {t}
                </Badge>
              ))}
            </div>
            {detail.summary && (
              <div className="glass-soft p-3 text-sm">
                <p className="mb-1 text-xs text-muted">AI 摘要</p>
                {detail.summary}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto scroll-thin whitespace-pre-wrap rounded-xl bg-black/25 p-3 text-xs leading-relaxed">{detail.content || "（沒有文字內容）"}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={analyzing} onClick={() => analyze(detail)}>
                AI 整理重點
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const vis = detail.visibility === "private" ? "link" : "private";
                  await apiPatch(`/materials/${detail.id}`, { visibility: vis });
                  toast.push("success", vis === "link" ? "已建立分享連結權限" : "已改為私人");
                  await reload();
                  setDetail({ ...detail, visibility: vis });
                }}
              >
                {detail.visibility === "private" ? "設為可分享" : "設為私人"}
              </Button>
            </div>
            {analysis && (
              <div className="glass-soft space-y-2 p-3 text-xs">
                {Array.isArray(analysis.keyPoints) && (
                  <div>
                    <p className="mb-1 font-medium">重點</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {(analysis.keyPoints as string[]).map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(analysis.vocabulary) && (analysis.vocabulary as Array<{ word: string; meaning: string }>).length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">單字</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(analysis.vocabulary as Array<{ word: string; meaning: string }>).map((v, i) => (
                        <Badge key={i} tone="cyan">
                          {v.word}：{v.meaning}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

type OcrPage = { id: string; orderIndex: number; rotation: number; text: string; status: string; imageUrl: string | null; highlights: Array<{ color: string; x: number; y: number; w: number; h: number }>; crop: { x: number; y: number; w: number; h: number } | null };
type OcrDoc = { id: string; title: string; subject: string; status: string; combinedText: string };

const HIGHLIGHT_COLORS = [
  { key: "yellow", label: "黃：本次考試", css: "#facc15" },
  { key: "green", label: "綠：重要", css: "#4ade80" },
  { key: "blue", label: "藍：句子", css: "#60a5fa" },
  { key: "pink", label: "粉：單字", css: "#f472b6" },
  { key: "orange", label: "橘：注意", css: "#fb923c" },
];

export function OcrPanel() {
  const toast = useToast();
  const list = useApi<{ documents: OcrDoc[] }>("/ocr/documents");
  const [activeId, setActiveId] = useState<string | null>(null);
  const detail = useApi<{ document: OcrDoc; pages: OcrPage[] }>(activeId ? `/ocr/documents/${activeId}` : null, [activeId]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"highlight" | "crop">("highlight");
  const [color, setColor] = useState("yellow");
  const [result, setResult] = useState<{ action: string; result: Record<string, unknown> } | null>(null);
  const drag = useRef<{ pageId: string; startX: number; startY: number } | null>(null);

  async function createDoc() {
    setBusy(true);
    try {
      const res = await apiPost<{ document: OcrDoc }>("/ocr/documents", { title: `辨識 ${new Date().toLocaleDateString("zh-TW")}` });
      setActiveId(res.document.id);
      await list.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length || !activeId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      await apiPost(`/ocr/documents/${activeId}/pages`, fd);
      toast.push("success", `已加入 ${files.length} 張圖片`);
      await detail.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runOcr() {
    if (!activeId) return;
    setBusy(true);
    try {
      await apiPost(`/ocr/documents/${activeId}/run`);
      toast.push("success", "OCR 完成，可直接編輯文字");
      await detail.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function transform(action: string) {
    if (!activeId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiPost<{ action: string; result: Record<string, unknown> }>(`/ocr/documents/${activeId}/transform`, { action });
      setResult(res);
      toast.push("success", "AI 轉換完成");
    } catch (err) {
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, pageId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { pageId, startX: (e.clientX - rect.left) / rect.width, startY: (e.clientY - rect.top) / rect.height };
  }

  async function onPointerUp(e: React.PointerEvent<HTMLDivElement>, page: OcrPage) {
    if (!drag.current || drag.current.pageId !== page.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / rect.width;
    const endY = (e.clientY - rect.top) / rect.height;
    const x = Math.min(drag.current.startX, endX);
    const y = Math.min(drag.current.startY, endY);
    const w = Math.abs(endX - x - (endX - drag.current.startX) + (endX - drag.current.startX));
    const box = { x, y, w: Math.abs(endX - drag.current.startX), h: Math.abs(endY - drag.current.startY) };
    drag.current = null;
    if (box.w < 0.03 || box.h < 0.02) return;
    void w;
    try {
      if (mode === "highlight") {
        await apiPatch(`/ocr/pages/${page.id}`, { highlights: [...page.highlights, { color, ...box }] });
      } else {
        await apiPatch(`/ocr/pages/${page.id}`, { crop: box });
      }
      await detail.reload();
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  return (
    <Card
      title="🖼️ 圖片 OCR 與轉學習內容"
      subtitle="拍照或上傳多張圖片 → 排序／旋轉／裁切／螢光筆標記 → AI 辨識 → 轉成筆記、題目、記憶卡"
      action={
        <div className="flex gap-1.5">
          <Select value={activeId ?? ""} onChange={(e) => setActiveId(e.target.value || null)} className="!w-auto !py-1.5 text-xs">
            <option value="">選擇文件…</option>
            {list.data?.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </Select>
          <Button size="sm" loading={busy} onClick={createDoc}>
            ＋ 新文件
          </Button>
        </div>
      }
    >
      {!activeId && <EmptyState icon="📷" title="建立一份辨識文件開始" hint="可一次上傳多張課本、考卷或黑板照片。" />}

      {activeId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="focus-ring cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">
              📁 選擇圖片（可多選）
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadImages(e.target.files)} />
            </label>
            <label className="focus-ring cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-xs hover:bg-white/5">
              📸 拍照
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => uploadImages(e.target.files)} />
            </label>
            <Button size="sm" loading={busy} onClick={runOcr}>
              ✨ 開始 AI 辨識
            </Button>
            <div className="flex items-center gap-1.5 text-xs">
              <button onClick={() => setMode("highlight")} className={`rounded-lg px-2 py-1 ${mode === "highlight" ? "bg-[#7c5cff]/30" : "bg-white/5"}`}>
                螢光筆
              </button>
              <button onClick={() => setMode("crop")} className={`rounded-lg px-2 py-1 ${mode === "crop" ? "bg-[#7c5cff]/30" : "bg-white/5"}`}>
                裁切
              </button>
              {mode === "highlight" &&
                HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setColor(c.key)}
                    title={c.label}
                    className={`h-5 w-5 rounded-full border-2 ${color === c.key ? "border-white" : "border-transparent"}`}
                    style={{ background: c.css }}
                  />
                ))}
            </div>
          </div>

          {detail.loading && <Skeleton lines={4} />}
          {detail.error && <ErrorState message={detail.error} onRetry={detail.reload} />}

          <div className="max-h-[70vh] grid gap-3 overflow-y-auto overscroll-contain scroll-thin pr-1 touch-pan-y sm:grid-cols-2">
            {detail.data?.pages.map((p, idx) => (
              <div key={p.id} className="glass-soft solid-data-surface p-2">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                  <span>
                    #{idx + 1}・{p.status}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={async () => {
                        await apiPatch(`/ocr/pages/${p.id}`, { orderIndex: Math.max(0, p.orderIndex - 1) });
                        await detail.reload();
                      }}
                      className="rounded px-1.5 hover:bg-white/10"
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      onClick={async () => {
                        await apiPatch(`/ocr/pages/${p.id}`, { orderIndex: p.orderIndex + 1 });
                        await detail.reload();
                      }}
                      className="rounded px-1.5 hover:bg-white/10"
                      title="下移"
                    >
                      ↓
                    </button>
                    <button
                      onClick={async () => {
                        await apiPatch(`/ocr/pages/${p.id}`, { rotation: (p.rotation + 90) % 360 });
                        await detail.reload();
                      }}
                      className="rounded px-1.5 hover:bg-white/10"
                      title="旋轉"
                    >
                      ⟳
                    </button>
                    <button
                      onClick={async () => {
                        await apiPatch(`/ocr/pages/${p.id}`, { highlights: [], crop: null });
                        await detail.reload();
                      }}
                      className="rounded px-1.5 hover:bg-white/10"
                      title="清除標記"
                    >
                      ⌫
                    </button>
                    <button
                      onClick={async () => {
                        await apiDelete(`/ocr/pages/${p.id}`);
                        await detail.reload();
                      }}
                      className="rounded px-1.5 text-rose-300 hover:bg-white/10"
                      title="刪除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div
                  className="relative touch-none overflow-hidden rounded-lg bg-black/40"
                  onPointerDown={(e) => onPointerDown(e, p.id)}
                  onPointerUp={(e) => onPointerUp(e, p)}
                >
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={`OCR 頁面 ${idx + 1}`} className="w-full select-none" style={{ transform: `rotate(${p.rotation}deg)` }} draggable={false} />
                  )}
                  {p.highlights.map((h, i) => (
                    <span
                      key={i}
                      className="pointer-events-none absolute rounded"
                      style={{
                        left: `${h.x * 100}%`,
                        top: `${h.y * 100}%`,
                        width: `${h.w * 100}%`,
                        height: `${h.h * 100}%`,
                        background: `${HIGHLIGHT_COLORS.find((c) => c.key === h.color)?.css ?? "#facc15"}55`,
                        border: `1.5px solid ${HIGHLIGHT_COLORS.find((c) => c.key === h.color)?.css ?? "#facc15"}`,
                      }}
                    />
                  ))}
                  {p.crop && (
                    <span
                      className="pointer-events-none absolute border-2 border-dashed border-white/80"
                      style={{ left: `${p.crop.x * 100}%`, top: `${p.crop.y * 100}%`, width: `${p.crop.w * 100}%`, height: `${p.crop.h * 100}%` }}
                    />
                  )}
                </div>
                <Textarea
                  value={p.text}
                  onChange={(e) => detail.setData((prev) => (prev ? { ...prev, pages: prev.pages.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)) } : prev))}
                  onBlur={async (e) => {
                    await apiPatch(`/ocr/pages/${p.id}`, { text: e.target.value });
                    toast.push("success", "文字已儲存");
                  }}
                  className="mt-2 !min-h-[90px] text-xs"
                  placeholder="OCR 文字會出現在這裡，可直接修改"
                />
              </div>
            ))}
          </div>

          {detail.data?.pages.length ? (
            <div className="flex flex-wrap gap-1.5">
              {[
                ["notes", "整理筆記"],
                ["keypoints", "找重點"],
                ["questions", "出題"],
                ["solve", "解題"],
                ["flashcards", "記憶卡"],
                ["translate", "翻譯"],
                ["wrong", "易錯提醒"],
                ["plan", "複習計畫"],
              ].map(([action, label]) => (
                <Button key={action} size="sm" variant="ghost" loading={busy} onClick={() => transform(action)}>
                  {label}
                </Button>
              ))}
            </div>
          ) : null}

          {result && (
            <div className="glass-soft max-h-72 overflow-y-auto scroll-thin p-3 text-xs">
              <p className="mb-2 font-medium">AI 結果（{result.action}）</p>
              {typeof result.result.body === "string" ? (
                <pre className="whitespace-pre-wrap font-sans leading-relaxed">{result.result.body as string}</pre>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(result.result, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type Note = { id: string; title: string; subject: string; body: string; updatedAt: string; visibility: string };

export function NotesPanel() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ notes: Note[] }>("/notes");
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", subject: "其他", body: "" });

  return (
    <Card
      title="🗒️ 我的筆記"
      subtitle="AI 整理與 OCR 轉換的筆記都會自動存在這裡"
      action={
        <Button size="sm" onClick={() => { setCreating(true); setForm({ title: "", subject: "其他", body: "" }); }}>
          ＋ 新增筆記
        </Button>
      }
    >
      {loading && <Skeleton lines={3} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !data?.notes.length && <EmptyState icon="📝" title="還沒有筆記" hint="可手動建立，或讓 AI 從教材／OCR 產生。" />}
      <div className="grid gap-2 sm:grid-cols-2">
        {data?.notes.map((n) => (
          <button key={n.id} onClick={() => setEditing(n)} className="glass-soft focus-ring p-3 text-left hover:bg-white/5">
            <p className="truncate text-sm font-medium">{n.title}</p>
            <p className="text-[11px] text-muted">
              {n.subject}・{new Date(n.updatedAt).toLocaleDateString("zh-TW")}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{n.body.slice(0, 120)}</p>
          </button>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="新增筆記">
        <div className="space-y-3">
          <Field label="標題" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="科目">
            <Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              {SUBJECTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="內容">
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="!min-h-[160px]" />
          </Field>
          <Button
            full
            onClick={async () => {
              if (!form.title.trim()) return toast.push("error", "請輸入標題");
              await apiPost("/notes", form);
              toast.push("success", "筆記已建立");
              setCreating(false);
              await reload();
            }}
          >
            建立
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.title ?? ""} wide>
        {editing && (
          <div className="space-y-3">
            <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className="!min-h-[300px] text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  await apiPatch(`/notes/${editing.id}`, { body: editing.body });
                  toast.push("success", "已儲存");
                  await reload();
                }}
              >
                儲存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await apiPost<{ url: string }>("/shares", { kind: "note", title: editing.title, payload: { body: editing.body.slice(0, 4000), subject: editing.subject } });
                  await navigator.clipboard.writeText(`${window.location.origin}${res.url}`);
                  toast.push("success", "分享連結已複製");
                }}
              >
                建立分享卡
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await apiDelete(`/notes/${editing.id}`);
                  toast.push("success", "已刪除");
                  setEditing(null);
                  await reload();
                }}
              >
                刪除
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export async function fetchMaterialsForSelect() {
  return apiGet<{ materials: Material[] }>("/materials");
}
