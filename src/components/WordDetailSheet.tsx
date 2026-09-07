"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Card, ErrorState, Progress, Skeleton, useToast } from "@/components/ui";
import { apiPatch, apiPost, errorMessage, useApi } from "@/lib/api";
import { NovaCostNotice, confirmNovaSpend } from "@/components/NovaCostNotice";
import { Wordmark } from "@/components/brand";

export type WordPreview = {
  id: string;
  word: string;
  meaning: string;
  meanings?: string[];
  part_of_speech?: string;
  partOfSpeech?: string;
  example?: string;
  example_zh?: string;
  exampleZh?: string;
  familiarity?: number;
};

type SourceKind = "source" | "ai" | string;
type DetailItem = { sourceKind?: SourceKind };
type DetailResponse = {
  word: {
    id: string;
    word: string;
    meaning: string;
    meanings: string[];
    englishDefinition: string;
    partOfSpeech: string;
    level: string;
    phonetics: { us: string; uk: string };
    audio: { us: string; uk: string };
    pronunciation: { us: boolean; uk: boolean; fallback: string };
  };
  explanations: Array<{ explanation: string; sourceKind: SourceKind }>;
  synonyms: Array<{ word: string; meaning: string; partOfSpeech: string; difference: string; usage: string; sourceKind: SourceKind }>;
  examples: Array<{ english: string; chinese: string; level: string; sourceKind: SourceKind }>;
  phrases: Array<{ phrase: string; meaning: string; sourceKind: SourceKind }>;
  forms: Array<{ form: string; partOfSpeech: string; meaning: string; sourceKind: SourceKind }>;
  aiContent: { content: Record<string, unknown>; model: string; generatedAt: string } | null;
  progress: { state: string; familiarity: number; correctCount: number; wrongCount: number; nextReviewAt: string | null; memoryTip: string };
};

type AiContent = {
  explanations?: string[];
  synonyms?: Array<{ word: string; meaning: string; partOfSpeech: string; difference: string; usage: string }>;
  examples?: Array<{ english: string; chinese: string; level: string }>;
  phrases?: Array<{ phrase: string; meaning: string }>;
  forms?: Array<{ form: string; partOfSpeech: string; meaning: string }>;
  mistakes?: Array<{ wrong: string; correct: string; reason: string }>;
  memoryTip?: string;
  etymology?: string;
};

const stateLabels: Record<string, { label: string; tone: "muted" | "cyan" | "green" | "rose" | "gold" }> = {
  not_learned: { label: "尚未學習", tone: "muted" },
  learning: { label: "學習中", tone: "cyan" },
  mastered: { label: "已掌握", tone: "green" },
  mistakes: { label: "錯題", tone: "rose" },
  review: { label: "待複習", tone: "gold" },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedExample({ sentence, target }: { sentence: string; target: string }) {
  const parts = sentence.split(new RegExp(`(${escapeRegExp(target)})`, "gi"));
  return <>{parts.map((part, index) => part.toLowerCase() === target.toLowerCase() ? <strong key={`${part}-${index}`} className="font-extrabold text-[#7dd3fc]">{part}</strong> : <span key={`${part}-${index}`}>{part}</span>)}</>;
}

function SourceBadge({ sourceKind }: { sourceKind?: SourceKind }) {
  if (sourceKind === "ai") return <Badge tone="violet">AI 補充</Badge>;
  if (sourceKind === "generated") return <Badge tone="gold">系統生成</Badge>;
  return <Badge tone="muted">教材內容</Badge>;
}

function SpeakButton({ text, lang = "en-US", label = "朗讀", spellFirst = false }: { text: string; lang?: string; label?: string; spellFirst?: boolean }) {
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    if (spellFirst) {
      const spelling = new SpeechSynthesisUtterance(text.split("").join(", "));
      const completeWord = new SpeechSynthesisUtterance(text);
      spelling.lang = lang;
      completeWord.lang = lang;
      spelling.onend = () => {
        window.setTimeout(() => window.speechSynthesis.speak(completeWord), 700);
      };
      window.speechSynthesis.speak(spelling);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  };
  return <button type="button" onClick={speak} aria-label={`${label}：${text}`} className="focus-ring shrink-0 rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] text-muted transition hover:border-[#37d3ff]/50 hover:text-[#b8efff]">🔊 {label}</button>;
}

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`space-y-2 ${className}`}><div className="flex items-center gap-2"><h2 className="text-sm font-semibold tracking-wide text-[#e8edff]">{title}</h2><span className="h-px flex-1 bg-[var(--line)]" /></div>{children}</section>;
}

function DetailSkeleton() {
  return <div className="space-y-5"><Skeleton lines={2} /><div className="grid gap-3 sm:grid-cols-2"><div className="glass-soft h-28 animate-pulse" /><div className="glass-soft h-28 animate-pulse" /></div><Skeleton lines={5} /></div>;
}

export function WordDetailSheet({ wordId, preview, onClose }: { wordId: string | null; preview?: WordPreview | null; onClose: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const detail = useApi<DetailResponse>(wordId ? `/words/${wordId}/detail` : null, [wordId]);
  const quotas = useApi<{ quotas: Array<{ feature: string; novaCost: number }> }>("/quotas");
  const aiCost = quotas.data?.quotas.find((item) => item.feature === "ai_context")?.novaCost ?? null;
  const aiChatCost = quotas.data?.quotas.find((item) => item.feature === "ai_chat")?.novaCost ?? null;
  const [generatedAi, setGeneratedAi] = useState<{ wordId: string; content: Record<string, unknown> } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<{ wordId: string; message: string } | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiReplyWordId, setAiReplyWordId] = useState<string | null>(null);
  const [aiQuestionLoading, setAiQuestionLoading] = useState(false);
  const aiConversationId = useRef<string | null>(null);
  const historyWordId = useRef<string | null>(null);
  const closeRef = useRef<() => void>(() => undefined);
  const animateCloseRef = useRef<() => void>(() => undefined);

  const animateClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setOpen(false);
    closeTimer.current = window.setTimeout(onClose, 260);
  }, [closing, onClose]);

  const close = useCallback(() => {
    if (typeof window !== "undefined" && historyWordId.current === wordId && window.history.state?.__studynovaWordDetail === wordId) {
      window.history.back();
      return;
    }
    animateClose();
  }, [animateClose, wordId]);
  useEffect(() => {
    closeRef.current = close;
    animateCloseRef.current = animateClose;
  }, [close, animateClose]);

  useEffect(() => {
    if (!wordId) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      setOpen(true);
      window.setTimeout(() => closeButton.current?.focus(), 40);
    }, 16);
    return () => window.clearTimeout(timer);
  }, [wordId]);

  useEffect(() => {
    if (!wordId) return;
    historyWordId.current = wordId;
    window.history.pushState({ ...(window.history.state ?? {}), __studynovaWordDetail: wordId }, "", window.location.href);
    const onPopState = () => animateCloseRef.current();
    window.addEventListener("popstate", onPopState);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
      if (historyWordId.current === wordId && window.history.state?.__studynovaWordDetail === wordId) {
        window.history.replaceState({ ...(window.history.state ?? {}), __studynovaWordDetail: undefined }, "", window.location.href);
      }
      historyWordId.current = null;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [wordId]);

  async function generateAi() {
    if (!wordId || !detail.data || !confirmNovaSpend(`產生「${detail.data.word.word}」的 AI 補充`, aiCost)) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await apiPost<{ content: Record<string, unknown> }>(`/words/${wordId}/ai-content`, {});
      setGeneratedAi({ wordId, content: result.content });
      await detail.reload();
    } catch (error) {
      const message = errorMessage(error);
      setAiError({ wordId, message });
      toast.push("error", message);
    } finally {
      setAiLoading(false);
    }
  }

  async function askAi(question?: string) {
    if (!wordId || !detail.data) return;
    const asked = question?.trim() || aiQuestion.trim() || "請用簡單方式解釋這個單字，告訴我常見用法，並提供一個例句。";
    if (!confirmNovaSpend(`詢問 AI「${detail.data.word.word}」`, aiChatCost)) return;
    setAiQuestion(asked);
    setAiQuestionLoading(true);
    try {
      let conversationId = aiConversationId.current;
      if (!conversationId) {
        const created = await apiPost<{ conversation: { id: string } }>("/ai/conversations", { title: `單字：${detail.data.word.word}`, mode: "teacher", allowContext: [] });
        conversationId = created.conversation.id;
        aiConversationId.current = conversationId;
      }
      const result = await apiPost<{ message: { content: string } }>(`/ai/conversations/${conversationId}/messages`, {
        content: `請以繁體中文回答。正在學習的單字是「${detail.data.word.word}」。詞性：${detail.data.word.partOfSpeech || "未知"}。中文意思：${detail.data.word.meaning}。英文定義：${detail.data.word.englishDefinition || "無"}。我的問題是：${asked}`,
      });
      setAiReply(result.message.content);
      setAiReplyWordId(wordId);
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setAiQuestionLoading(false);
    }
  }

  async function updateProgress(action: "mastered" | "review" | "mistake" | "reset") {
    if (!wordId) return;
    setProgressBusy(true);
    try {
      await apiPatch<{ progress: DetailResponse["progress"] }>(`/words/${wordId}/progress`, { action });
      await detail.reload();
      toast.push("success", action === "mastered" ? "已標記為已掌握" : action === "review" ? "已加入複習" : action === "mistake" ? "已加入錯題本" : "已重設學習狀態");
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setProgressBusy(false);
    }
  }

  function playPronunciation(kind: "us" | "uk") {
    const pronunciation = detail.data?.word;
    if (!pronunciation) return;
    const audioUrl = pronunciation.audio[kind];
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const lang = kind === "us" ? "en-US" : "en-GB";
      const spelling = new SpeechSynthesisUtterance(pronunciation.word.split("").join(", "));
      const completeWord = new SpeechSynthesisUtterance(pronunciation.word);
      spelling.lang = lang;
      completeWord.lang = lang;
      window.speechSynthesis.cancel();
      spelling.onend = () => {
        window.setTimeout(() => window.speechSynthesis.speak(completeWord), 700);
      };
      window.speechSynthesis.speak(spelling);
      return;
    }
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      void audio.play().catch(() => toast.push("error", "目前無法播放發音"));
      return;
    }
    toast.push("error", "此瀏覽器不支援語音播放");
  }

  const data = detail.data;
  const aiContent = generatedAi?.wordId === wordId ? generatedAi.content : data?.aiContent?.content ?? null;
  const aiErrorMessage = aiError?.wordId === wordId ? aiError.message : null;
  const aiAskPlaceholder = `例如：${data?.word.word ?? "這個單字"} 和 give up 有什麼差別？`;
  const currentAiReply = aiReplyWordId === wordId ? aiReply : null;
  const ai = (aiContent ?? {}) as AiContent;
  const state = stateLabels[data?.progress.state ?? "not_learned"] ?? stateLabels.not_learned;
  const previewPartOfSpeech = preview?.partOfSpeech ?? preview?.part_of_speech ?? "";
  const previewExampleZh = preview?.exampleZh ?? preview?.example_zh ?? "";
  const visibleExamples = data?.examples ?? [];
  const visibleExplanations = data?.explanations ?? [];
  const aiExamples = (ai.examples ?? []).map((item) => ({ ...item, sourceKind: "ai" }));
  const examples = [...visibleExamples, ...aiExamples];
  const aiSynonyms = (ai.synonyms ?? []).map((item) => ({ ...item, sourceKind: "ai" }));
  const synonyms = [...(data?.synonyms ?? []), ...aiSynonyms];
  const aiPhrases = (ai.phrases ?? []).map((item) => ({ ...item, sourceKind: "ai" }));
  const phrases = [...(data?.phrases ?? []), ...aiPhrases];
  const aiForms = (ai.forms ?? []).map((item) => ({ ...item, sourceKind: "ai" }));
  const forms = [...(data?.forms ?? []), ...aiForms];
  const allExplanations = [...visibleExplanations, ...(ai.explanations ?? []).map((explanation) => ({ explanation, sourceKind: "ai" }))];

  if (!wordId) return null;

  return (
    <div className={`fixed inset-0 z-[120] transition-opacity duration-200 ease-out motion-reduce:transition-none ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <button type="button" aria-label="關閉單字詳細資訊" className="absolute inset-0 bg-[#02040b]/70 backdrop-blur-[2px]" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-detail-title"
        ref={dialogRef}
        className={`absolute inset-x-0 bottom-0 flex h-[100dvh] flex-col border-t border-[#37d3ff]/25 bg-[var(--bg)] shadow-[0_-24px_80px_rgba(0,0,0,0.45)] transition-transform duration-220 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform motion-reduce:transition-none ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-4"><Wordmark size={15} /><span className="h-1.5 w-10 rounded-full bg-[#37d3ff]/40" /><p className="truncate text-xs text-muted">單字詳細資訊</p></div>
          <button ref={closeButton} type="button" onClick={close} aria-label="返回單字列表" className="focus-ring rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-muted transition hover:border-[#37d3ff]/50 hover:text-[var(--text)]">返回</button>
        </header>
        <main className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain scroll-smooth px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 [-webkit-overflow-scrolling:touch] sm:px-8 sm:pt-5">
          <div className="mx-auto max-w-5xl space-y-6">
            {detail.loading && <DetailSkeleton />}
            {detail.error && <ErrorState message={detail.error} onRetry={detail.reload} />}
            {data && (
              <>
                <section className="glass relative overflow-hidden p-5 sm:p-8">
                  <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#37d3ff]/10 blur-3xl" />
                  <div className="relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><h1 id="word-detail-title" className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-[clamp(2.25rem,10vw,4.5rem)] font-extrabold leading-[0.95] tracking-tight text-[#f6f8ff]">{data.word.word}</h1><Badge tone={state.tone}>{state.label}</Badge></div><p className="mt-3 text-sm text-muted">{data.word.partOfSpeech || previewPartOfSpeech || "單字"}・{data.word.level}</p><div className="mt-3 flex flex-wrap gap-2">{data.word.pronunciation.us && <Button size="sm" variant="outline" onClick={() => playPronunciation("us")}>🔊 US {data.word.phonetics.us && <span className="ml-1 text-muted">{data.word.phonetics.us}</span>}</Button>}{data.word.pronunciation.uk && <Button size="sm" variant="outline" onClick={() => playPronunciation("uk")}>🔊 UK {data.word.phonetics.uk && <span className="ml-1 text-muted">{data.word.phonetics.uk}</span>}</Button>}</div></div>
                    <div className="w-full shrink-0 rounded-2xl border border-[#37d3ff]/20 bg-[#37d3ff]/8 p-3 text-sm lg:w-52"><p className="text-xs text-muted">目前學習狀態</p><p className="mt-1 font-semibold text-[#b8efff]">{state.label}</p><Progress value={data.progress.familiarity} max={100} tone={state.tone === "green" ? "green" : "cyan"} /><p className="mt-1 text-[11px] text-muted">熟悉度 {data.progress.familiarity}%・答對 {data.progress.correctCount} 次・答錯 {data.progress.wrongCount} 次</p></div>
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card title="基本資訊"><div className="space-y-3"><div><p className="text-xs text-muted">中文意思・{data.word.partOfSpeech || previewPartOfSpeech || "n."}</p><div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 break-words text-xl font-semibold text-[#7dd3fc]">{data.word.meaning || "尚未補上中文釋義"}</p><SpeakButton text={data.word.meaning} label="朗讀意思" lang="zh-TW" /></div></div>{data.word.meanings.length > 1 && <div className="space-y-1.5"><p className="text-xs text-muted">其他意思・{data.word.partOfSpeech || previewPartOfSpeech || "n."}</p>{data.word.meanings.map((meaning) => <div key={meaning} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5"><span className="min-w-0 flex-1 break-words text-sm">{meaning}</span><SpeakButton text={meaning} label="朗讀" lang="zh-TW" /></div>)}</div>}{data.word.englishDefinition && <div><p className="text-xs text-muted">English definition・{data.word.partOfSpeech || previewPartOfSpeech || "n."}</p><div className="mt-1 flex items-start gap-2"><p className="min-w-0 flex-1 break-words text-sm leading-relaxed">{data.word.englishDefinition}</p><SpeakButton text={data.word.englishDefinition} label="朗讀定義" /></div></div>}</div></Card>
                  <Card title="學習操作"><div className="flex flex-wrap gap-2"><Button loading={progressBusy} onClick={() => updateProgress("mastered")}>標記為已掌握</Button><Button loading={progressBusy} variant="outline" onClick={() => updateProgress("review")}>加入複習</Button><Button loading={progressBusy} variant="ghost" onClick={() => updateProgress("mistake")}>加入錯題</Button></div><p className="mt-3 text-xs text-muted">這些狀態只會更新目前登入帳號，不會改變其他學生的學習進度。</p></Card>
                </div>

                <Card title="不熟悉這個單字？詢問 AI"><NovaCostNotice cost={aiChatCost} action="詢問單字 AI" /><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askAi(); }} placeholder={aiAskPlaceholder} aria-label="想詢問 AI 的單字問題" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-black/15 px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-muted focus:border-[#37d3ff]/60" /><Button loading={aiQuestionLoading} onClick={() => void askAi()}>{currentAiReply ? "再次詢問 AI" : "詢問 AI"}</Button></div>{!currentAiReply && <p className="mt-2 text-xs text-muted">按下按鈕會把目前單字、詞性、意思與你的問題一起交給 Novi 解答。</p>}{currentAiReply && <div className="mt-3 whitespace-pre-wrap rounded-xl border border-[#7c5cff]/25 bg-[#7c5cff]/8 p-3 text-sm leading-relaxed text-[#eeeaff]">{currentAiReply}</div>}</Card>

                {allExplanations.length > 0 && <Section title="單字解釋"><div className="grid gap-2 sm:grid-cols-2">{allExplanations.map((item, index) => <div key={`${item.explanation}-${index}`} className="glass-soft flex items-start justify-between gap-3 p-3 text-sm"><span className="min-w-0 flex-1">{index + 1}. {item.explanation}</span><div className="flex shrink-0 items-center gap-2"><SpeakButton text={item.explanation} label="朗讀解釋" /><SourceBadge sourceKind={item.sourceKind} /></div></div>)}</div></Section>}

                {synonyms.length > 0 && <Section title="相似字與近義字"><div className="grid gap-3 md:grid-cols-2">{synonyms.map((item, index) => <div key={`${item.word}-${index}`} className="glass-soft p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-[#b8efff]">{item.word}</p><p className="text-xs text-muted">{item.meaning}・{item.partOfSpeech}</p></div><div className="flex shrink-0 items-center gap-2"><SpeakButton text={item.word} label="朗讀單字" spellFirst /><SourceBadge sourceKind={item.sourceKind} /></div></div>{item.difference && <p className="mt-2 text-sm leading-relaxed">差異：{item.difference}</p>}{item.usage && <p className="mt-1 text-xs text-muted">情境：{item.usage}</p>}</div>)}</div></Section>}

                {examples.length > 0 && <Section title="例句"><div className="space-y-3">{examples.map((item, index) => <div key={`${item.english}-${index}`} className="glass-soft p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-words text-sm leading-relaxed">{data.word.word ? <HighlightedExample sentence={item.english} target={data.word.word} /> : item.english}</p><div className="mt-1 flex items-start gap-2"><p className="min-w-0 flex-1 break-words text-sm text-muted">{item.chinese}</p><SpeakButton text={`${item.english}。${item.chinese}`} label="朗讀例句" /></div></div><Badge tone="muted">{item.level || "一般"}</Badge></div><div className="mt-1"><SourceBadge sourceKind={item.sourceKind} /></div></div>)}</div></Section>}
                {examples.length === 0 && preview && (preview.example || previewExampleZh) && <Section title="例句"><div className="glass-soft p-3 text-sm"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="break-words"><HighlightedExample sentence={preview.example ?? ""} target={data.word.word} /></p><p className="mt-1 break-words text-muted">{previewExampleZh}</p></div><SpeakButton text={`${preview.example ?? ""}。${previewExampleZh}`} label="朗讀例句" /></div></div></Section>}

                {phrases.length > 0 && <Section title="常見搭配"><div className="grid gap-2 sm:grid-cols-2">{phrases.map((item, index) => <div key={`${item.phrase}-${index}`} className="glass-soft p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-words font-medium text-[#b8efff]">{item.phrase}</p>{item.meaning && <p className="mt-1 break-words text-xs text-muted">{item.meaning}</p>}</div><div className="flex shrink-0 items-center gap-2"><SpeakButton text={`${item.phrase}。${item.meaning}`} label="朗讀" /><SourceBadge sourceKind={item.sourceKind} /></div></div></div>)}</div></Section>}
                {forms.length > 0 && <Section title="詞性變化"><div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{forms.map((item, index) => <div key={`${item.form}-${index}`} className="glass-soft p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{item.form}</p><p className="break-words text-xs text-muted">{item.partOfSpeech}・{item.meaning}</p></div><div className="flex shrink-0 items-center gap-2"><SpeakButton text={item.form} label="朗讀詞性" spellFirst /><SourceBadge sourceKind={item.sourceKind} /></div></div></div>)}</div></Section>}

                <Section title="AI 補充">{!aiContent && !data.aiContent ? <NovaCostNotice cost={aiCost} action="產生 AI 單字補充" /> : <p className="mb-2 text-xs text-muted">這個單字的 AI 補充已快取，再次查看不會重複扣除 Nova。</p>}<div className="glass-soft p-4">{aiLoading && <div className="flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 animate-ping rounded-full bg-[#37d3ff]" />AI 正在整理這個單字……</div>}{aiErrorMessage && !aiLoading && <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-rose-200">AI 補充暫時無法取得</p><Button size="sm" variant="outline" onClick={generateAi}>重新產生</Button></div>}{!aiLoading && !aiErrorMessage && !aiContent && !data.aiContent && <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">目前尚未產生 AI 補充；基本單字資料不受影響。</p><Button size="sm" onClick={generateAi}>產生 AI 補充</Button></div>}{!aiLoading && (aiContent || data.aiContent) && <div className="space-y-3">{ai.memoryTip && <div><p className="text-xs text-muted">記憶技巧</p><p className="mt-1 text-sm leading-relaxed">{ai.memoryTip}</p></div>}{ai.etymology && <div><p className="text-xs text-muted">詞源／字根（AI）</p><p className="mt-1 text-sm leading-relaxed">{ai.etymology}</p></div>}{ai.mistakes?.length ? <div><p className="text-xs text-muted">常見錯誤</p><div className="mt-1 space-y-1.5">{ai.mistakes.map((mistake, index) => <div key={`${mistake.wrong}-${index}`} className="rounded-xl bg-black/20 p-2 text-sm"><p className="text-rose-200">❌ {mistake.wrong}</p><p className="text-emerald-200">✅ {mistake.correct}</p><p className="mt-0.5 text-xs text-muted">{mistake.reason}</p></div>)}</div></div> : null}</div>}</div></Section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
