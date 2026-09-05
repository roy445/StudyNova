"use client";

import { useEffect, useRef, useState } from "react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const history = useApi<{ documents: Array<{ id: string; title: string; subject: string; analysis_kind: string }> }>(searchTerm.trim() ? `/ocr/search?q=${encodeURIComponent(searchTerm.trim())}` : null, [searchTerm]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const detail = useApi<{ document: OcrDoc; pages: OcrPage[] }>(activeId ? `/ocr/documents/${activeId}` : null, [activeId]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"highlight" | "crop">("highlight");
  const [analysisMode, setAnalysisMode] = useState<"auto" | "vocabulary" | "sentences" | "questions">("auto");
  const [color, setColor] = useState("yellow");
  const [result, setResult] = useState<{ action: string; result: Record<string, unknown> } | null>(null);
  const [visionPreflight, setVisionPreflight] = useState<Record<string, unknown> | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState<Record<string, unknown> | null>(null);
  const [selectedVisionItems, setSelectedVisionItems] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const drag = useRef<{ pageId: string; startX: number; startY: number } | null>(null);

  useEffect(() => {
    if (!cameraOpen) {
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = null;
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.push("error", "此瀏覽器不支援網頁相機，請改用相簿上傳");
      return;
    }
    let cancelled = false;
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => toast.push("error", "無法開啟相機，請確認瀏覽器權限或改用相簿上傳"));
    return () => {
      cancelled = true;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = null;
    };
  }, [cameraFacing, cameraOpen, toast]);

  async function toggleTorch() {
    const track = cameraStream.current?.getVideoTracks()[0] as (MediaStreamTrack & { applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void> }) | undefined;
    if (!track?.applyConstraints) {
      toast.push("info", "此裝置或瀏覽器不支援網頁閃光燈控制");
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((value) => !value);
    } catch {
      toast.push("info", "此裝置不允許網頁控制閃光燈，請使用系統相機設定");
    }
  }

  async function captureCamera() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    await uploadImages({ 0: new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }), length: 1, item: () => null } as unknown as FileList);
    setCameraOpen(false);
  }

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

  async function saveLearning(action: "vocabulary" | "note" | "question", item: Record<string, unknown>) {
    if (!activeId) return;
    if (!window.confirm(`要將這筆${action === "vocabulary" ? "單字／片語" : action === "note" ? "筆記" : "題目"}加入「我的教材／我的單字」嗎？加入後可以在學習中心查看並製作測驗。`)) return;
    try {
      const res = await apiPost<{ saved: number; duplicates: number }>(`/ocr/documents/${activeId}/learning-action`, { action, items: [item] });
      toast.push("success", res.duplicates ? "這筆資料已存在，沒有重複建立" : `已加入${action === "vocabulary" ? "單字本" : action === "note" ? "筆記" : "題目／錯題資料"}`);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  async function saveVocabularyBatch(items: Array<Record<string, unknown>>) {
    if (!activeId || !items.length) return;
    if (!window.confirm(`AI 已整理出 ${items.length} 個單字／片語，要加入「我的單字」嗎？`)) return;
    try {
      const res = await apiPost<{ saved: number; duplicates: number }>(`/ocr/documents/${activeId}/learning-action`, { action: "vocabulary", items });
      toast.push("success", `已加入 ${res.saved} 個單字${res.duplicates ? `，${res.duplicates} 個已存在` : ""}`);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  async function createCameraQuiz() {
    if (!activeId || !visionAnalysis) return;
    const sourceItems = Array.isArray(visionAnalysis.items) ? (visionAnalysis.items as Array<Record<string, unknown>>) : [];
    const items = sourceItems.flatMap((item) => {
      if (item.kind === "question") return [item];
      if (item.kind === "vocabulary") {
        const language = item.language && typeof item.language === "object" ? item.language as Record<string, unknown> : {};
        const meanings = Array.isArray(item.meanings) ? item.meanings : Array.isArray(language.meanings) ? language.meanings : [];
        const meaning = String(item.meaning ?? (meanings[0] && typeof meanings[0] === "object" ? (meanings[0] as Record<string, unknown>).meaning : "") ?? "").trim();
        return meaning ? [{ ...item, kind: "question", rawText: `${meaning} 的英文是？`, elements: { options: [{ text: String(item.word ?? "") }] }, answer: { value: String(item.word ?? "") }, type: "單字四選一" }] : [];
      }
      if (item.kind === "sentence") return [{ ...item, kind: "question", rawText: String(item.rawText ?? item.label ?? ""), type: "句子理解" }];
      return [];
    });
    if (!items.length) {
      toast.push("info", "目前分析結果沒有可建立測驗的單字、句子或題目");
      return;
    }
    if (!window.confirm(`要將這 ${items.length} 個辨識內容建立成測驗，並加入你的題庫嗎？`)) return;
    try {
      const res = await apiPost<{ saved: number; quiz?: { title: string } }>(`/ocr/documents/${activeId}/learning-action`, { action: "quiz", items });
      toast.push("success", res.quiz ? `已建立 ${res.quiz.title}` : `已建立 ${res.saved} 題練習`);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  async function vision(stage: "preflight" | "analyze", force = false) {
    if (!activeId) return;
    setBusy(true);
    try {
      const res = await apiPost<{ stage: string; preflight?: Record<string, unknown>; analysis?: Record<string, unknown>; retakeMessage?: string | null }>(`/ocr/documents/${activeId}/vision-analysis`, {
        stage,
        pageIds: detail.data?.pages.map((p) => p.id),
        itemIds: selectedVisionItems.length ? selectedVisionItems : undefined,
        analysisMode,
        // 不預設任何顏色，讓 AI 自己判斷圖片中是否真的有螢光筆與其語意。
        selectedHighlightColors: [],
        force,
      });
      if (stage === "preflight") {
        setVisionPreflight(res.preflight ?? null);
        setVisionAnalysis(null);
        setSelectedVisionItems([]);
        toast.push(res.retakeMessage ? "error" : "success", res.retakeMessage ?? "圖片品質與內容偵測完成");
      } else {
        setVisionAnalysis(res.analysis ?? null);
        toast.push("success", "影像理解分析完成，可檢查並編輯結果");
      }
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
      <div className="space-y-2 rounded-xl bg-black/15 p-2"><Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜尋分析紀錄，例如 environment、二次函數…" />{searchTerm.trim() && <div className="max-h-32 space-y-1 overflow-y-auto scroll-thin">{history.loading && <p className="text-xs text-muted">搜尋中…</p>}{history.data?.documents.map((d) => <button key={d.id} onClick={() => { setActiveId(d.id); setSearchTerm(""); }} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/10"><span className="truncate">{d.title}・{d.subject}</span><span className="text-muted">{d.analysis_kind}</span></button>)}{!history.loading && !history.data?.documents.length && <p className="text-xs text-muted">找不到符合的私人分析紀錄。</p>}</div>}</div>
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
            <Select value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value as typeof analysisMode)} className="!w-auto !py-1.5 text-xs" aria-label="AI 分析模式">
              <option value="auto">智慧讀取（AI 自動判斷）</option>
              <option value="vocabulary">只分析單字／片語</option>
              <option value="sentences">只分析句子／句型</option>
              <option value="questions">只分析題目</option>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setCameraOpen(true)}>開啟取景器</Button>
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

          {cameraOpen && (
            <div className="solid-data-surface fixed inset-3 z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-cyan-300/30 p-3 shadow-2xl sm:inset-8">
              <div className="flex items-center justify-between gap-2"><div><p className="font-semibold">AI 鏡頭取景</p><p className="text-xs text-muted">把題目、單字或筆記放入框內，拍攝後可先檢查再分析。</p></div><Button size="sm" variant="ghost" onClick={() => setCameraOpen(false)}>關閉</Button></div>
              <div className="relative my-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black"><video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" /><div className="pointer-events-none absolute inset-[8%] rounded-2xl border-2 border-dashed border-cyan-300/90 shadow-[0_0_0_9999px_rgba(0,0,0,.24)]" /><p className="absolute left-1/2 top-[9%] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">請將內容放在框內</p></div>
              <div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="ghost" onClick={() => setCameraFacing((value) => value === "environment" ? "user" : "environment")}>切換鏡頭</Button><Button size="sm" variant="ghost" onClick={toggleTorch}>{torchOn ? "關閉閃光燈" : "開啟閃光燈"}</Button><Button onClick={captureCamera}>拍照並加入分析</Button></div>
            </div>
          )}
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
          {activeId && detail.data?.pages.length ? (
            <div className="solid-data-surface space-y-3 rounded-2xl border border-cyan-300/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">AI 鏡頭智慧分析</p>
                  <p className="text-[11px] text-muted">影像 → 品質 → OCR → 版面理解 → 教學分析；原圖會保留。可切換智慧讀取、單字／片語、句子／句型或題目模式。</p>
                </div>
                <Button size="sm" loading={busy} onClick={() => vision("preflight")}>先檢查圖片</Button>
              </div>
              {visionPreflight && (
                <div className="space-y-2 text-xs">
                  <p className="font-medium">圖片品質與偵測結果</p>
                  {Array.isArray(visionPreflight.pages) && (visionPreflight.pages as Array<Record<string, unknown>>).map((p, i) => (
                    <div key={String(p.pageId ?? i)} className="rounded-xl bg-black/20 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span>第 {i + 1} 頁</span><Badge tone={p.canAnalyze === false ? "rose" : "green"}>{p.canAnalyze === false ? "建議重新拍攝" : "可分析"}</Badge></div>
                      {Array.isArray(p.issues) && <p className="mt-1 text-muted">{(p.issues as unknown[]).map(String).join("；") || "未發現明顯問題"}</p>}
                      {p.canAnalyze === false && <Button size="sm" variant="ghost" onClick={() => setCameraOpen(true)}>重新拍攝</Button>}
                      {Array.isArray(p.items) && <div className="mt-2 space-y-1">{(p.items as Array<Record<string, unknown>>).map((item) => {
                        const id = String(item.id ?? "");
                        const checked = selectedVisionItems.includes(id);
                        return <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5"><input type="checkbox" checked={checked} onChange={() => setSelectedVisionItems((old) => checked ? old.filter((x) => x !== id) : [...old, id])} /><span>{String(item.label ?? item.kind ?? "內容")}</span><span className="ml-auto text-muted">信心 {Math.round(Number(item.confidence ?? 0) * 100)}%</span></label>;
                      })}</div>}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1.5"><Button size="sm" variant="ghost" onClick={() => setSelectedVisionItems([])}>全部分析</Button><Button size="sm" loading={busy} onClick={() => vision("analyze", true)}>{selectedVisionItems.length ? `分析選取 ${selectedVisionItems.length} 項` : analysisMode === "vocabulary" ? "找單字與片語" : analysisMode === "sentences" ? "找句子與句型" : "開始智慧分析"}</Button></div>
                </div>
              )}
              {visionAnalysis && <VisionAnalysisResult data={visionAnalysis} onAction={saveLearning} onBatchVocabulary={saveVocabularyBatch} onCreateQuiz={createCameraQuiz} />}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function VisionAnalysisResult({ data, onAction, onBatchVocabulary, onCreateQuiz }: { data: Record<string, unknown>; onAction: (action: "vocabulary" | "note" | "question", item: Record<string, unknown>) => void; onBatchVocabulary: (items: Array<Record<string, unknown>>) => void; onCreateQuiz: () => void }) {
  const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
  const uncertainties = Array.isArray(data.uncertainties) ? (data.uncertainties as Array<Record<string, unknown>>) : [];
  return (
      <div className="max-h-[55vh] space-y-2 overflow-y-auto scroll-thin text-xs"><div className="flex flex-wrap gap-1.5"><Button size="sm" variant="ghost" onClick={onCreateQuiz}>建立題目練習</Button>{items.some((item) => item.kind === "article") && <Button size="sm" variant="ghost" onClick={() => onBatchVocabulary(items.filter((item) => item.kind === "article").flatMap((item) => { const article = item.article && typeof item.article === "object" ? item.article as Record<string, unknown> : {}; return Array.isArray(article.importantVocabulary) ? (article.importantVocabulary as unknown[]).map((word) => ({ word: String(word), sourcePageIds: item.sourcePageIds, subject: item.subject })) : []; }))}>重要單字加入單字本</Button>}</div>
      <div className="rounded-xl bg-cyan-400/10 p-2"><p className="font-medium">分析摘要</p><p className="mt-1 whitespace-pre-wrap text-muted">{String(data.documentSummary ?? "未提供摘要")}</p><p className="mt-1 text-muted">內容類型：{Array.isArray(data.contentTypes) ? (data.contentTypes as unknown[]).map(String).join("、") || "未判斷" : "未判斷"}</p></div>
      {uncertainties.length > 0 && <div className="rounded-xl bg-amber-400/10 p-2"><p className="font-medium text-amber-200">需要確認的內容</p>{uncertainties.map((u, i) => <p key={i} className="mt-1 text-muted">{String(u.location ?? "未知位置")}：{String(u.text ?? "")} {Array.isArray(u.alternatives) ? `（可能是：${(u.alternatives as unknown[]).map(String).join("／")}）` : ""}</p>)}</div>}
      {!items.length && <p className="rounded-xl bg-black/20 p-3 text-muted">沒有取得可確認的內容，請檢查圖片或重新拍攝。</p>}
      {items.map((item, index) => {
        const answer = (item.answer ?? {}) as Record<string, unknown>;
        const elements = (item.elements ?? {}) as Record<string, unknown>;
        const language = (item.language ?? {}) as Record<string, unknown>;
        const article = (item.article ?? {}) as Record<string, unknown>;
        const handwriting = (item.handwriting ?? {}) as Record<string, unknown>;
        const certainty = String(answer.certainty ?? "");
        return <details key={String(item.id ?? index)} className="group rounded-xl bg-black/20 p-2" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><span>{String(item.label ?? `內容 ${index + 1}`)}</span><Badge tone={certainty === "uncertain" || certainty === "not-found" ? "rose" : "cyan"}>{String(item.kind ?? item.type ?? "內容")}</Badge><span className="ml-auto text-muted">{Math.round(Number(item.confidence ?? 0) * 100)}%</span></summary>
          <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
            <p className="whitespace-pre-wrap">{String(item.rawText ?? "")}</p>
            {String(item.subject ?? "") && <p className="text-muted">{String(item.subject)}・{String(item.type ?? "")}・難度：{String(item.difficulty ?? "不確定")}</p>}
            {Array.isArray((elements as { options?: unknown[] }).options) && <div><p className="font-medium">選項分析</p>{((elements.options ?? []) as Array<Record<string, unknown>>).map((o, i) => <p key={i} className="mt-1">{String(o.label ?? "")}：{String(o.isCorrect === true ? "正確" : o.isCorrect === false ? "未判定為正確" : "不確定")}。{String(o.analysis ?? "")}</p>)}</div>}
            {String(answer.value ?? "") && <div><p className="font-medium">答案／解題</p><p>答案：{String(answer.value)}</p><p>已知：{String(answer.given ?? "未提供")}</p><p>求：{String(answer.asked ?? "未提供")}</p><p>概念：{String(answer.concept ?? "未提供")}</p>{Array.isArray(answer.steps) && <ol className="list-decimal space-y-1 pl-5">{(answer.steps as unknown[]).map((s, i) => <li key={i}>{String(s)}</li>)}</ol>}<p>{String(answer.finalReason ?? "")}</p></div>}
            {String(language.translationNatural ?? "") && <div><p className="font-medium">英文語言分析</p><p>自然翻譯：{String(language.translationNatural)}</p><p>結構理解：{String(language.translationStructural ?? "")}</p>{Array.isArray(language.grammar) && <p>文法：{(language.grammar as Array<Record<string, unknown>>).map((g) => `${String(g.name)}（${String(g.explanation)}）`).join("；")}</p>}{Array.isArray(language.phrases) && <p>重要片語：{(language.phrases as Array<Record<string, unknown>>).map((p) => `${String(p.phrase)}：${String(p.meaning)}`).join("；")}</p>}{Array.isArray(language.vocabulary) && <div><p className="font-medium">單字分析（可逐一加入單字本）</p><div className="mt-1 grid gap-1.5 sm:grid-cols-2">{(language.vocabulary as Array<Record<string, unknown>>).map((v, i) => { const meanings = Array.isArray(v.meanings) ? (v.meanings as Array<Record<string, unknown>>).map((m) => `${String(m.meaning ?? "")}（${String(m.context ?? "語境") }）`).join("；") : String(v.meaning ?? ""); const confusables = Array.isArray(v.confusables) ? (v.confusables as Array<Record<string, unknown>>).map((c) => `${String(c.word)}：${String(c.difference)}`).join("；") : ""; const collocations = Array.isArray(v.collocations) ? (v.collocations as unknown[]).map(String).join("、") : ""; return <div key={`${String(v.word ?? "word")}-${i}`} className="rounded-lg bg-white/5 p-2"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{String(v.word ?? "")}</p><p className="text-muted">{String(v.partOfSpeech ?? "")}・{meanings}</p></div><Button size="sm" variant="ghost" onClick={() => onAction("vocabulary", { ...v, sourcePageIds: item.sourcePageIds, subject: item.subject })}>加入</Button></div><p className="mt-1 text-muted">音標：{String(v.phonetic ?? "未提供")}　英：{String(v.uk ?? "未提供")}　美：{String(v.us ?? "未提供")}</p>{collocations && <p className="text-muted">搭配：{collocations}</p>}{confusables && <p className="text-muted">容易搞混：{confusables}</p>}{Boolean(v.root && typeof v.root === "object" && (v.root as Record<string, unknown>).reliable === true) && <p className="text-muted">可靠字根：{String((v.root as Record<string, unknown>).text ?? "")}</p>}{String(v.learningAssociation ?? "") && <p className="text-muted">學習聯想：{String(v.learningAssociation)}</p>}</div>; })}</div></div>}</div>}
            {String(article.summary ?? "") && <div><p className="font-medium">文章分析</p><p>摘要：{String(article.summary)}</p>{Array.isArray(article.paragraphs) && (article.paragraphs as Array<Record<string, unknown>>).map((p, i) => <div key={i} className="mt-1 rounded-lg bg-white/5 p-2"><p>第 {i + 1} 段：{String(p.mainIdea ?? "")}</p><p className="text-muted">重點：{Array.isArray(p.keyInformation) ? (p.keyInformation as unknown[]).map(String).join("；") : ""}</p></div>)}</div>}
            {String(handwriting.organizedNotes ?? "") && <div><p className="font-medium">手寫筆記整理（原稿不會被覆蓋）</p><p>OCR：{String(handwriting.ocrText ?? "")}</p><p>整理版：{String(handwriting.organizedNotes)}</p><p>摘要：{String(handwriting.summary ?? "")}</p></div>}
            <div className="flex flex-wrap gap-1.5 pt-1"><Button size="sm" variant="ghost" onClick={() => onAction(item.kind === "vocabulary" ? "vocabulary" : item.kind === "question" ? "question" : "note", item)}>{item.kind === "vocabulary" ? "加入單字本" : item.kind === "question" ? "加入題目資料" : "加入筆記"}</Button>{item.kind === "article" && <Button size="sm" variant="ghost" onClick={() => onAction("note", item)}>保存文章整理</Button>}</div>
          </div>
        </details>;
      })}
    </div>
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
