"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Progress, Select, Skeleton, Tabs, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPost, errorMessage, shareContent, useApi } from "@/lib/api";
import { WordsPanel } from "@/features/study/panels-c";
import { DAILY_KNOWLEDGE, dailyKnowledge } from "@/data/daily-knowledge";

type Friend = { userId: string; novaId: string; displayName: string; level: number | null; xp: number | null };
type Challenge = {
  id: string;
  kind: string;
  title: string;
  creatorName: string;
  quizId: string | null;
  payload?: { track?: "junior" | "senior"; questionCount?: number; direction?: "zh2en" | "en2zh" | "mixed"; difficulty?: "easy" | "normal" | "hard"; readyUserIds?: string[] };
  expiresAt: string;
  joined: boolean;
  participants: Array<{ userId: string; displayName: string; score: number; durationSec: number; finishedAt: string | null }>;
};

type ChallengeMode = "choice" | "listening" | "handwriting" | "confusable" | "part_of_speech" | "meaning" | "semantic_image";
type SemanticOption = { id: string; label: string; emoji: string; imageUrl: string; correct: boolean };
type ChallengeWord = { id: string; word: string; meaning: string; partOfSpeech: string; example?: string; exampleZh?: string; level: string; direction?: "zh2en" | "en2zh"; challengeMode?: ChallengeMode; options?: string[]; answer?: string; sentence?: string; semanticOptions?: SemanticOption[] };
type AnswerRecord = { number: number; word: string; prompt: string; expected: string; response: string; correct: boolean; timedOut: boolean };
type TimeMode = "standard" | "sprint";

type QuizRunnerProps = { title: string; words: ChallengeWord[]; direction: "zh2en" | "en2zh" | "mixed"; difficulty: string; challengeMode?: ChallengeMode; timeMode?: TimeMode; onFinish: (score: number, total: number, durationSec: number, records: AnswerRecord[]) => Promise<void>; onExit: () => void };

function secondsForMode(mode: ChallengeMode, timeMode: TimeMode) {
  if (timeMode === "sprint") return 10;
  if (mode === "handwriting" || mode === "listening") return 45;
  if (mode === "meaning" || mode === "confusable" || mode === "semantic_image") return 35;
  if (mode === "part_of_speech") return 25;
  return 30;
}

const semanticScenes = [
  { emoji: "🏫", label: "校園情境" },
  { emoji: "🏠", label: "日常生活" },
  { emoji: "🌳", label: "戶外情境" },
  { emoji: "🚌", label: "出行與社會情境" },
  { emoji: "🍽️", label: "生活活動" },
  { emoji: "🧪", label: "學習與實驗" },
  { emoji: "🏃", label: "人物行動" },
  { emoji: "🌧️", label: "天氣與環境" },
];

function createSemanticImage(scene: { emoji: string; label: string }, seed: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#172554"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs><rect width="640" height="360" rx="28" fill="url(#g)"/><circle cx="520" cy="90" r="68" fill="#67e8f9" opacity=".18"/><circle cx="130" cy="280" r="100" fill="#a78bfa" opacity=".18"/><text x="320" y="190" text-anchor="middle" font-size="104">${scene.emoji}</text><text x="320" y="305" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="28">${scene.label}</text><text x="320" y="335" text-anchor="middle" fill="#bae6fd" font-family="Arial,sans-serif" font-size="14">StudyNova semantic visual · ${seed.slice(0, 6)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function decorateChallengeWord(word: ChallengeWord, index: number, mode: ChallengeMode): ChallengeWord {
  const sentence = word.sentence || word.example || `A student used the word ${word.word} in a real situation.`;
  if (mode !== "semantic_image") return { ...word, challengeMode: mode, sentence };
  const correctScene = semanticScenes[index % semanticScenes.length];
  const distractors = semanticScenes.filter((_, sceneIndex) => sceneIndex !== index % semanticScenes.length).slice(0, 3);
  return { ...word, challengeMode: mode, sentence, semanticOptions: [
    { id: `${word.id}-correct`, label: correctScene.label, emoji: correctScene.emoji, imageUrl: createSemanticImage(correctScene, word.id), correct: true },
    ...distractors.map((scene, optionIndex) => ({ id: `${word.id}-${optionIndex}`, label: scene.label, emoji: scene.emoji, imageUrl: createSemanticImage(scene, `${word.id}-${optionIndex}`), correct: false })),
  ].sort((a, b) => `${word.id}-${a.id}`.localeCompare(`${word.id}-${b.id}`)) };
}

function QuizRunner({ title, words, direction, difficulty, challengeMode = "choice", timeMode = "standard", onFinish, onExit }: QuizRunnerProps) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [typed, setTyped] = useState("");
  const [summary, setSummary] = useState<{ score: number; total: number; durationSec: number; records: AnswerRecord[] } | null>(null);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [finishing, setFinishing] = useState(false);
  const current = words[index];
  const mode = current?.challengeMode ?? challengeMode;
  const secondsPerQuestion = secondsForMode(mode, timeMode);
  const [remaining, setRemaining] = useState(secondsPerQuestion);
  const actualDirection = current?.direction ?? (direction === "mixed" ? (index % 2 === 0 ? "zh2en" : "en2zh") : direction);
  const choices = useMemo(() => {
    if (!current) return [];
    const answer = mode === "part_of_speech" ? current.partOfSpeech : current.answer ?? (actualDirection === "zh2en" ? current.word : current.meaning);
    if (mode === "listening" || mode === "handwriting" || mode === "semantic_image") return [];
    if (current.options?.length) return [...current.options].filter(Boolean).sort(() => Math.random() - 0.5);
    if (mode === "part_of_speech") return [answer, "n.", "v.", "adj.", "adv.", "prep.", "conj."].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex).slice(0, 4).sort(() => Math.random() - 0.5);
    const pool = words.filter((word) => word.id !== current.id).map((word) => actualDirection === "zh2en" ? word.word : word.meaning).filter(Boolean);
    return [answer, ...pool].filter((item, itemIndex, all) => all.indexOf(item) === itemIndex).slice(0, 4).sort(() => Math.random() - 0.5);
  }, [actualDirection, current, mode, words]);

  useEffect(() => {
    if (!current || summary || selected !== null || submitting) return;
    const resetTimer = window.setTimeout(() => setRemaining(secondsPerQuestion), 0);
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          void choose("", true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => { window.clearTimeout(resetTimer); window.clearInterval(timer); };
    // choose is intentionally kept local to the runner; the question/index dependencies reset this timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, index, secondsPerQuestion, selected, submitting, summary]);

  if (finishing) return <Card title="⏳ 正在整理挑戰結果" subtitle="正在保存你的作答紀錄，請稍等一下…"><div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-[#37d3ff]/25 border-t-[#37d3ff]" /><p className="text-sm text-muted">正在計算分數與整理錯題，不會漏掉你的紀錄。</p></div></Card>;
  if (summary) return <Card title="🎉 挑戰完成" subtitle={title}><div className="space-y-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="glass-soft rounded-xl p-3 text-center"><p className="text-xs text-muted">總分</p><p className="mt-1 text-2xl font-black text-[#7dd3fc]">{summary.score}</p></div><div className="glass-soft rounded-xl p-3 text-center"><p className="text-xs text-muted">答對</p><p className="mt-1 text-2xl font-black text-emerald-300">{correct}/{summary.total}</p></div><div className="glass-soft rounded-xl p-3 text-center"><p className="text-xs text-muted">未作答</p><p className="mt-1 text-2xl font-black text-amber-200">{summary.records.filter((item) => item.timedOut).length}</p></div><div className="glass-soft rounded-xl p-3 text-center"><p className="text-xs text-muted">用時</p><p className="mt-1 text-2xl font-black">{summary.durationSec}s</p></div></div><p className="text-center text-sm text-muted">{summary.score >= 90 ? "表現非常好，繼續保持！" : summary.score >= 60 ? "做得不錯，再複習錯題會更穩。" : "先整理錯題，再挑戰一次看看。"}</p><div className="max-h-80 space-y-2 overflow-y-auto pr-1">{summary.records.map((item) => <div key={item.number} className={`rounded-xl border p-3 text-left text-sm ${item.timedOut ? "border-amber-300/30 bg-amber-300/5" : item.correct ? "border-emerald-300/30 bg-emerald-300/5" : "border-rose-300/30 bg-rose-300/5"}`}><div className="flex items-center justify-between gap-2"><span>第 {item.number} 題・{item.word}</span><Badge tone={item.timedOut ? "gold" : item.correct ? "green" : "rose"}>{item.timedOut ? "未作答" : item.correct ? "答對" : "答錯"}</Badge></div><p className="mt-1 text-xs text-muted">題目：{item.prompt}</p><p className="mt-1 text-xs">正確答案：{item.expected}{item.response ? `・你的答案：${item.response}` : "・未作答"}</p></div>)}</div><Button full onClick={onExit}>返回挑戰專區</Button></div></Card>;
  if (!current) return <EmptyState icon="✓" title="題目準備中" />;
  async function choose(answer: string, timedOut = false) {
    if (selected !== null || submitting) return;
    setSelected(answer || "__timeout__");
    const expected = mode === "part_of_speech" ? current.partOfSpeech : mode === "listening" ? current.word : mode === "semantic_image" ? "語意圖片" : current.answer ?? (actualDirection === "zh2en" ? current.word : current.meaning);
    const isCorrect = !timedOut && (mode === "semantic_image" ? current.semanticOptions?.find((option) => option.id === answer)?.correct === true : answer.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase());
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextRecords = [...records, { number: index + 1, word: current.word, prompt: actualDirection === "zh2en" ? current.meaning : current.word, expected, response: answer, correct: isCorrect, timedOut }];
    setRecords(nextRecords);
    setCorrect(nextCorrect);
    if (!isCorrect) {
      const addToWrongBook = timedOut ? false : window.confirm(`答錯了：${current.word}\n要加入錯題本，之後到「學習中心 → 錯題本」複習嗎？`);
      void apiPost("/words/answer", { wordId: current.id, correct: false, mode: "challenge", addToWrongBook });
    } else {
      void apiPost("/words/answer", { wordId: current.id, correct: true, mode: "challenge", addToWrongBook: false });
    }
    setTimeout(async () => {
      if (index + 1 < words.length) {
        setIndex((value) => value + 1);
        setSelected(null);
        setTyped("");
        return;
      }
      setSubmitting(true);
      setFinishing(true);
      const score = Math.round((nextCorrect / words.length) * 100);
      const durationSec = Math.round((Date.now() - startedAt) / 1000);
      await onFinish(score, words.length, durationSec, nextRecords);
      setSummary({ score, total: words.length, durationSec, records: nextRecords });
      setSubmitting(false);
      setFinishing(false);
    }, 550);
  }
      const expected = mode === "part_of_speech" ? current.partOfSpeech : mode === "listening" ? current.word : mode === "semantic_image" ? "語意圖片" : current.answer ?? (actualDirection === "zh2en" ? current.word : current.meaning);
  return (
    <Card title={title} subtitle={`${index + 1}/${words.length} 題・難度 ${difficulty === "easy" ? "簡單" : difficulty === "hard" ? "困難" : "普通"}`}>
      <div className="mb-4 flex items-center justify-between gap-2 text-xs text-muted"><span>{mode === "semantic_image" ? "辨識語意・聽完整句子，選最符合語意的圖片" : mode === "listening" ? "聽力模式・只播放英文，請手寫單字" : mode === "confusable" ? "易混淆單字辨析" : mode === "part_of_speech" ? "詞性辨識（n.／v.／adj.／adv.）" : mode === "meaning" ? "單字多義辨析" : actualDirection === "zh2en" ? "中文 → 英文" : "英文 → 中文"}<span className="ml-2">第 {index + 1}/{words.length} 題</span></span><Badge tone={remaining <= 5 ? "rose" : "cyan"}>剩餘 {remaining}s・答對 {correct} 題</Badge></div>
      <div className="glass-soft mb-4 rounded-2xl p-6 text-center">
        {mode === "semantic_image" || mode === "listening" ? <Button aria-label="播放英文聽力" className="min-h-16 min-w-48 text-lg" onClick={() => { const text = mode === "semantic_image" ? current.sentence : current.word; if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; window.speechSynthesis.speak(u); } }}>播放英文</Button> : <><p className="text-2xl font-bold text-[#e8edff]">{actualDirection === "zh2en" ? current.meaning : current.word}</p><p className="mt-2 text-xs text-muted">{current.partOfSpeech}</p></>}
      </div>
      {mode === "handwriting" || mode === "listening" ? <div className="flex gap-2"><Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={mode === "listening" ? "聽完英文後手寫單字" : actualDirection === "zh2en" ? "請手寫輸入英文" : "請手寫輸入中文"} disabled={Boolean(selected) || submitting} onKeyDown={(e) => e.key === "Enter" && void choose(typed.trim())} /><Button disabled={!typed.trim()} onClick={() => void choose(typed.trim())}>送出</Button></div> : mode === "semantic_image" ? <div className="grid gap-3 sm:grid-cols-2">{current.semanticOptions?.map((option) => <button key={option.id} type="button" disabled={Boolean(selected) || submitting} onClick={() => void choose(option.id)} className={`focus-ring min-h-32 rounded-2xl border p-4 text-center transition ${selected ? option.id === selected ? option.correct ? "border-emerald-400/70 bg-emerald-400/15" : "border-rose-400/70 bg-rose-400/15" : option.correct ? "border-emerald-400/50 bg-emerald-400/10" : "border-[var(--line)] opacity-60" : "border-[var(--line)] bg-white/[0.03] hover:border-[#37d3ff]/60 hover:bg-[#37d3ff]/10"}`}><Image src={option.imageUrl} alt={option.label} width={640} height={360} unoptimized className="h-32 w-full rounded-xl object-cover" /><span className="mt-2 block text-sm">{option.label}</span></button>)}</div> : <div className="grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice} type="button" disabled={Boolean(selected) || submitting} onClick={() => void choose(choice)} className={`focus-ring rounded-xl border p-3 text-left text-sm transition ${selected ? choice === expected ? "border-emerald-400/60 bg-emerald-400/10" : choice === selected ? "border-rose-400/60 bg-rose-400/10" : "border-[var(--line)] opacity-60" : "border-[var(--line)] bg-white/[0.03] hover:border-[#37d3ff]/60 hover:bg-[#37d3ff]/10"}`}>{choice}</button>)}</div>}
      {mode !== "listening" && mode !== "semantic_image" && <p className="mt-4 text-center text-[11px] text-muted">選出最適合的答案，答完會自動進入下一題</p>}
      {mode === "semantic_image" && <p className="mt-4 text-center text-[11px] text-muted">聽懂句子後，選出最符合整句語意的圖片。</p>}
    </Card>
  );
}

function ChallengeInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "friends");
  const friends = useApi<{ friends: Friend[]; incoming: Array<{ id: string; novaId: string; displayName: string }>; outgoing: Array<{ id: string; novaId: string; displayName: string }>; blocked: Array<{ id: string; blockedId: string; novaId: string; displayName: string }> }>("/friends");
  const challenges = useApi<{ challenges: Challenge[] }>("/challenges");
  const rooms = useApi<{ rooms: Array<{ id: string; name: string; kind: string; joinCode: string; goalMinutes: number; totalToday: number; members: Array<{ userId: string; displayName: string; minutesToday: number }> }> }>("/rooms");
  const activities = useApi<{ live: Array<{ id: string; title: string; cover: string; description: string; goalValue: number; progress: number; rewardNova: number; rewardXp: number; endsAt: string; questionCount: number }>; upcoming: Array<{ id: string; title: string; startsAt: string }> }>("/activities");
  const [activityQuestionId, setActivityQuestionId] = useState<string | null>(null);
  const activityQuestions = useApi<{ questions: Array<{ id: string; subject: string; type: string; stem: string; options: string[]; explanation: string }> }>(activityQuestionId ? `/activities/${activityQuestionId}/questions` : null, [activityQuestionId]);
  const board = useApi<{ weekly: Array<{ userId: string; displayName: string; novaId: string; minutes: number; level: number | null }>; xp: Array<{ userId: string; displayName: string; xp: number; level: number }>; me: string }>("/leaderboard?scope=global");
  const quizzes = useApi<{ quizzes: Array<{ id: string; title: string }> }>("/quizzes");
  const weekly = useApi<{ weeks: Array<{ id: string; weekCode: string; title: string; open: boolean; proOnly: boolean }> }>("/weekly");
  const vocabulary = useApi<{ tracks: Array<{ id: "junior" | "senior"; label: string; description: string; count: number }>; sourceAvailability?: { unlocked: boolean; totalWords: number; minimumWords: number; manualOpen: boolean } }>("/words/catalog");
  const [vocabTrack, setVocabTrack] = useState<"junior" | "senior">("junior");
  const [selfForm, setSelfForm] = useState({ source: "catalog" as "catalog" | "mine" | "vocabulary", track: "junior" as "junior" | "senior", questionCount: 10, direction: "mixed" as "zh2en" | "en2zh" | "mixed", difficulty: "normal" as "easy" | "normal" | "hard", challengeMode: "choice" as ChallengeMode, timeMode: "standard" as TimeMode, shuffle: true });
  const [quizSession, setQuizSession] = useState<{ title: string; challengeId?: string; words: ChallengeWord[]; direction: "zh2en" | "en2zh" | "mixed"; difficulty: string; timeMode?: TimeMode } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [novaId, setNovaId] = useState(params.get("add") ?? "");
  const [qr, setQr] = useState<{ svg: string; link: string; novaId: string } | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [cForm, setCForm] = useState({ kind: "word", title: "", quizId: "", durationHours: 48, source: "catalog" as "catalog" | "mine" | "vocabulary", track: "junior" as "junior" | "senior", questionCount: 10, direction: "mixed" as "zh2en" | "en2zh" | "mixed", difficulty: "normal" as "easy" | "normal" | "hard", challengeMode: "choice" as ChallengeMode, timeMode: "standard" as TimeMode });
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: "", kind: "room", goalMinutes: 120 });
  const [joinCode, setJoinCode] = useState("");

  async function startSelfChallenge() {
    try {
      const sourceWords: ChallengeWord[] = selfForm.source === "mine"
        ? (await apiGet<{ items: ChallengeWord[] }>(`/my-vocabulary?limit=${selfForm.questionCount}`)).items
        : (await apiGet<{ words: ChallengeWord[] }>(selfForm.source === "vocabulary" ? `/words/all?source=vocabulary&limit=${selfForm.questionCount}` : `/words/all?track=${selfForm.track}&limit=${selfForm.questionCount}`)).words;
      const distinctWords = sourceWords.filter((word, index, all) => all.findIndex((candidate) => candidate.word.trim().toLocaleLowerCase("en-US") === word.word.trim().toLocaleLowerCase("en-US")) === index);
      const words = selfForm.shuffle ? [...distinctWords].sort(() => Math.random() - 0.5) : distinctWords;
      if (!words.length) throw new Error("目前沒有可用的題目");
      const preparedWords = words.slice(0, selfForm.questionCount).map((word, index) => decorateChallengeWord(word, index, selfForm.challengeMode === "listening" ? "listening" : selfForm.challengeMode));
      const nextSession = { title: `自我挑戰・${selfForm.source === "mine" ? "我的單字" : selfForm.source === "vocabulary" ? "字詞百科" : selfForm.track === "junior" ? "國中" : "高中"}`, words: preparedWords, direction: selfForm.direction, difficulty: selfForm.difficulty, challengeMode: selfForm.challengeMode, timeMode: selfForm.timeMode } as const;
      setCountdown(3);
      window.setTimeout(() => setCountdown(2), 1000);
      window.setTimeout(() => setCountdown(1), 2000);
      window.setTimeout(() => { setCountdown(null); setQuizSession(nextSession); }, 3000);
    } catch (err) {
      toast.push("error", errorMessage(err));
    }
  }

  if (countdown !== null) return <Card title="⚔️ 雙方已準備" subtitle="題目與選項已鎖定，所有參與者完全相同"><div className="flex min-h-[260px] flex-col items-center justify-center"><p className="text-sm text-muted">挑戰即將開始</p><p className="mt-3 text-8xl font-black text-[#37d3ff]">{countdown}</p></div></Card>;
  if (quizSession) return <div className="space-y-4"><QuizRunner {...quizSession} onExit={() => setQuizSession(null)} onFinish={async (score, total, durationSec, records) => { if (quizSession.challengeId) await apiPost(`/challenges/${quizSession.challengeId}/submit`, { score, durationSec, records }); else await apiPost("/words/session-complete", { correct: Math.round((score / 100) * total), total, seconds: durationSec }); toast.push("success", `挑戰完成！得分 ${score} 分`); await challenges.reload(); }} /><Button variant="ghost" onClick={() => setQuizSession(null)}>離開挑戰</Button></div>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">好友・挑戰・活動</h1>
        <p className="text-xs text-muted sm:text-sm">用 NOVA ID 加好友，一起挑戰、共讀與衝排行榜。</p>
      </header>

      <Tabs
        tabs={[
          { key: "friends", label: "好友", icon: "🤝" },
          { key: "challenge", label: "挑戰", icon: "⚔️" },
          { key: "vocab", label: "分級單字", icon: "🔤" },
          { key: "knowledge", label: "每日小知識", icon: "💡" },
          { key: "literacy", label: "素養挑戰", icon: "🧠" },
          { key: "room", label: "讀書房", icon: "🏫" },
          { key: "activity", label: "活動", icon: "🎉" },
          { key: "board", label: "排行榜", icon: "🏆" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "friends" && (
        <div className="space-y-4">
          <Card title="🔎 用 NOVA ID 加好友">
            <div className="flex flex-wrap gap-2">
              <Input value={novaId} onChange={(e) => setNovaId(e.target.value.toUpperCase())} placeholder="NV-XXXX-XXXX" className="min-w-[180px] flex-1" />
              <Button
                onClick={async () => {
                  try {
                    const res = await apiPost<{ status: string }>("/friends/request", { novaId });
                    toast.push("success", res.status === "accepted" ? "已成為好友！" : "已送出好友邀請");
                    setNovaId("");
                    await friends.reload();
                  } catch (err) {
                    toast.push("error", errorMessage(err));
                  }
                }}
              >
                送出邀請
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const res = await apiGet<{ svg: string; link: string; novaId: string }>("/account/nova-id-qr");
                  setQr(res);
                }}
              >
                我的 QR Code
              </Button>
            </div>
          </Card>

          {friends.data?.incoming.length ? (
            <Card title="📥 收到的邀請">
              <div className="space-y-2">
                {friends.data.incoming.map((r) => (
                  <div key={r.id} className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {r.displayName} <span className="text-xs text-muted">{r.novaId}</span>
                    </span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await apiPost(`/friends/requests/${r.id}/respond`, { accept: true });
                          toast.push("success", "已成為好友");
                          await friends.reload();
                        }}
                      >
                        接受
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await apiPost(`/friends/requests/${r.id}/respond`, { accept: false });
                          await friends.reload();
                        }}
                      >
                        拒絕
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card title="👥 我的好友">
            {friends.loading && <Skeleton lines={3} />}
            {friends.error && <ErrorState message={friends.error} onRetry={friends.reload} />}
            {!friends.loading && !friends.data?.friends.length && <EmptyState icon="🤝" title="還沒有好友" hint="把你的 NOVA ID 分享給同學吧！" />}
            <div className="grid gap-2 sm:grid-cols-2">
              {friends.data?.friends.map((f) => (
                <div key={f.userId} className="glass-soft flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.displayName}</p>
                    <p className="text-[11px] text-muted">
                      {f.novaId}・Lv.{f.level ?? 1}・{f.xp ?? 0} XP
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await apiPost("/friends/block", { userId: f.userId, block: true });
                        toast.push("info", "已封鎖");
                        await friends.reload();
                      }}
                    >
                      封鎖
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await apiDelete(`/friends/${f.userId}`);
                        await friends.reload();
                      }}
                    >
                      移除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {friends.data?.blocked.length ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-muted">已封鎖</p>
                {friends.data.blocked.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span>
                      {b.displayName}（{b.novaId}）
                    </span>
                    <button
                      className="underline"
                      onClick={async () => {
                        await apiPost("/friends/block", { userId: b.blockedId, block: false });
                        await friends.reload();
                      }}
                    >
                      解除封鎖
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {tab === "challenge" && (
        <div className="space-y-4">
          <Card title="🎯 自我挑戰" subtitle="自訂國中／高中單字測驗，完成後立即看到分數與獎勵。" action={<Badge tone="cyan">單人練習</Badge>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="題庫來源"><Select value={selfForm.source} onChange={(e) => setSelfForm({ ...selfForm, source: e.target.value as "catalog" | "mine" | "vocabulary" })}><option value="catalog">分級單字</option><option value="mine">我的單字</option><option value="vocabulary" disabled={!vocabulary.data?.sourceAvailability?.unlocked}>字詞百科{vocabulary.data?.sourceAvailability?.unlocked ? "" : `（未開放・${vocabulary.data?.sourceAvailability?.totalWords ?? 0}/100）`}</option></Select></Field>
              <Field label="詞庫">
                <Select value={selfForm.track} disabled={selfForm.source === "mine" || selfForm.source === "vocabulary"} onChange={(e) => setSelfForm({ ...selfForm, track: e.target.value as "junior" | "senior" })}><option value="junior">國中 2000 單</option><option value="senior">高中 7000 單</option></Select>
              </Field>
              <Field label="題數"><Select value={String(selfForm.questionCount)} onChange={(e) => setSelfForm({ ...selfForm, questionCount: Number(e.target.value) })}><option value="5">5 題</option><option value="10">10 題</option><option value="20">20 題</option><option value="50">50 題</option><option value="100">100 題</option></Select></Field>
              <Field label="難度"><Select value={selfForm.difficulty} onChange={(e) => setSelfForm({ ...selfForm, difficulty: e.target.value as "easy" | "normal" | "hard" })}><option value="easy">簡單</option><option value="normal">普通</option><option value="hard">困難</option></Select></Field>
              <Field label="題目方向"><Select value={selfForm.direction} onChange={(e) => setSelfForm({ ...selfForm, direction: e.target.value as "zh2en" | "en2zh" | "mixed" })}><option value="mixed">中英混合</option><option value="zh2en">中文 → 英文</option><option value="en2zh">英文 → 中文</option></Select></Field>
              <Field label="作答模式"><Select value={selfForm.challengeMode} onChange={(e) => setSelfForm({ ...selfForm, challengeMode: e.target.value as ChallengeMode })}><option value="choice">四選一</option><option value="meaning">多義選擇</option><option value="part_of_speech">詞性辨識</option><option value="handwriting">手寫作答</option><option value="listening">聽力・播放英文後手寫單字</option><option value="semantic_image">辨識語意・四圖選義</option><option value="confusable">易混淆辨析</option></Select></Field>
              <Field label="作答速度"><Select value={selfForm.timeMode} onChange={(e) => setSelfForm({ ...selfForm, timeMode: e.target.value as TimeMode })}><option value="standard">一般：依題型分配 25–45 秒</option><option value="sprint">速戰速決：每題 10 秒</option></Select></Field>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted"><input type="checkbox" checked={selfForm.shuffle} onChange={(e) => setSelfForm({ ...selfForm, shuffle: e.target.checked })} />每次開始時打亂題目</label>
            <Button className="mt-4" onClick={() => void startSelfChallenge()}>開始自我挑戰</Button>
          </Card>
          <Card title="⚔️ 好友挑戰" subtitle="邀請好友後，雙方完成同一組題目即可比較分數。" action={<div className="flex gap-1.5"><Button size="sm" variant="ghost" onClick={() => void challenges.reload()}>更新比分</Button><Button size="sm" onClick={() => setChallengeOpen(true)}>＋ 發起挑戰</Button></div>}>
          {challenges.loading && <Skeleton lines={3} />}
          {!challenges.loading && !challenges.data?.challenges.length && <EmptyState icon="⚔️" title="還沒有進行中的挑戰" hint="發起單字或測驗挑戰，和好友比分數！" />}
          <div className="space-y-2">
            {challenges.data?.challenges.map((c) => (
              <div key={c.id} className="glass-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-[11px] text-muted">
                      {c.kind === "word" ? "單字挑戰" : "測驗挑戰"}・由 {c.creatorName} 發起・截止 {new Date(c.expiresAt).toLocaleString("zh-TW")}
                    </p>
                    {c.kind === "word" && <p className="mt-1 text-[11px] text-[#7dd3fc]">準備進度：{c.payload?.readyUserIds?.length ?? 0}/2（雙方同題）</p>}
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const result = await apiGet<{ title: string; words: ChallengeWord[]; ready: boolean; readyCount: number; settings: { direction: "zh2en" | "en2zh" | "mixed"; difficulty: string; timeMode?: TimeMode } }>(`/challenges/${c.id}/words`);
                        if (!result.words.length) throw new Error("目前沒有可用的挑戰題目");
                        if (!result.ready) {
                          await apiPost(`/challenges/${c.id}/ready`);
                          toast.push("info", `你已準備，等待另一方加入（目前 ${result.readyCount + 1} 人）`);
                          await challenges.reload();
                          return;
                        }
                        if (result.readyCount < 2) {
                          toast.push("info", "等待另一方加入並準備後才會開始");
                          return;
                        }
                        setCountdown(3);
                        window.setTimeout(() => setCountdown(2), 1000);
                        window.setTimeout(() => setCountdown(1), 2000);
                        window.setTimeout(() => {
                          setCountdown(null);
                          setQuizSession({ title: result.title, challengeId: c.id, words: result.words.map((word, index) => decorateChallengeWord(word, index, word.challengeMode ?? "choice")), direction: result.settings.direction, difficulty: result.settings.difficulty, timeMode: result.settings.timeMode });
                        }, 3000);
                      } catch (err) {
                        toast.push("error", errorMessage(err));
                      }
                    }}
                  >
                    開始作答
                  </Button>
                </div>
                <div className="mt-2 space-y-1">
                  {c.participants.map((p, i) => (
                    <div key={p.userId} className="flex items-center justify-between text-xs">
                      <span>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {p.displayName}
                      </span>
                      <span className="tabular-nums text-muted">{p.finishedAt ? `${p.score} 分` : "尚未完成"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </Card>
        </div>
      )}

      {tab === "vocab" && (
        <div className="space-y-4">
          <Card title="🔤 分級單字挑戰" subtitle="每天固定 10 個單字，依今天的日期輪替題目；重新整理不會換題。">
            <div className="grid gap-3 sm:grid-cols-2">
              {(vocabulary.data?.tracks ?? [
                { id: "junior" as const, label: "國中 2000 單挑戰", description: "依國中英文 2000 字建立基礎字彙力", count: 2000 },
                { id: "senior" as const, label: "高中 7000 單挑戰", description: "依高中英文參考詞彙表準備進階字彙", count: 7000 },
              ]).map((trackOption) => (
                <button
                  key={trackOption.id}
                  type="button"
                  onClick={() => setVocabTrack(trackOption.id)}
                  className={`focus-ring rounded-2xl border p-4 text-left transition ${vocabTrack === trackOption.id ? "border-[#37d3ff]/70 bg-[#37d3ff]/10 shadow-[0_0_24px_rgba(55,211,255,0.12)]" : "border-[var(--line)] bg-white/[0.02] hover:bg-white/5"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{trackOption.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{trackOption.description}</p>
                    </div>
                    <Badge tone={vocabTrack === trackOption.id ? "cyan" : "muted"}>{trackOption.count.toLocaleString()} 字</Badge>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted">題庫來源：使用管理者提供的國中英文 2000 字與高中英文參考詞彙表 PDF。</p>
          </Card>
          <WordsPanel key={vocabTrack} track={vocabTrack} />
        </div>
      )}

      {tab === "knowledge" && (
        <div className="space-y-4">
          <Card title="💡 每日小知識" subtitle="每天一則，讀完就能把知識帶走。">
            <div className="rounded-2xl border border-[#37d3ff]/30 bg-gradient-to-br from-[#102e55] to-[#171936] p-5">
              <Badge tone="cyan">{dailyKnowledge(new Date().toISOString().slice(0, 10)).tag}</Badge>
              <h2 className="mt-3 text-xl font-bold text-[#e8edff]">{dailyKnowledge(new Date().toISOString().slice(0, 10)).title}</h2>
              <p className="mt-3 leading-8 text-muted">{dailyKnowledge(new Date().toISOString().slice(0, 10)).body}</p>
              <Link href="/study?tab=words" className="mt-4 inline-flex text-sm text-[#7dd3fc] underline">用今日單字複習 →</Link>
            </div>
          </Card>
          <Card title="知識庫" subtitle={`目前共有 ${DAILY_KNOWLEDGE.length} 則主題`}>
            <div className="grid gap-2 sm:grid-cols-2">
              {DAILY_KNOWLEDGE.map((item) => <article key={item.title} className="glass-soft p-3"><Badge tone="muted">{item.tag}</Badge><h3 className="mt-2 text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-6 text-muted">{item.body}</p></article>)}
            </div>
          </Card>
        </div>
      )}
      {tab === "literacy" && (
        <div className="space-y-4">
          <Card title="🧠 素養挑戰" subtitle="用情境理解、跨科閱讀與推理題檢驗自己。">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="glass-soft p-4"><p className="font-semibold">每週小考</p><p className="mt-1 text-xs leading-6 text-muted">依管理員發布的閱讀與素養題組作答，完成後會留下成績與錯題。</p><Link href="/weekly" className="mt-3 inline-flex text-sm text-[#7dd3fc] underline">前往每週小考 →</Link></div>
              <div className="glass-soft p-4"><p className="font-semibold">我的題庫</p><p className="mt-1 text-xs leading-6 text-muted">從 AI 鏡頭或學習資料建立測驗，支援限時作答與結果分析。</p><Link href="/study?tab=ai" className="mt-3 inline-flex text-sm text-[#7dd3fc] underline">建立素養測驗 →</Link></div>
            </div>
          </Card>
          <Card title="可作答題組" subtitle="你已建立的 AI 測驗">
            {quizzes.loading && <Skeleton lines={3} />}
            {!quizzes.loading && !quizzes.data?.quizzes.length && <EmptyState icon="🧠" title="尚未建立題組" hint="可從 AI 鏡頭或學習資料建立第一份素養測驗。" />}
            <div className="space-y-2">{quizzes.data?.quizzes.map((quiz) => <div key={quiz.id} className="glass-soft flex items-center justify-between gap-3 p-3"><span className="text-sm">{quiz.title}</span><Link href="/study?tab=quiz" className="text-xs text-[#7dd3fc] underline">前往測驗</Link></div>)}</div>
          </Card>
        </div>
      )}
      {tab === "room" && (
        <div className="space-y-4">
          <Card title="🏫 讀書房" action={<Button size="sm" onClick={() => setRoomOpen(true)}>＋ 建立</Button>}>
            <div className="mb-3 flex gap-2">
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="輸入邀請碼加入" />
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await apiPost("/rooms/join", { code: joinCode });
                    toast.push("success", "已加入讀書房");
                    setJoinCode("");
                    await rooms.reload();
                  } catch (err) {
                    toast.push("error", errorMessage(err));
                  }
                }}
              >
                加入
              </Button>
            </div>
            {rooms.loading && <Skeleton lines={3} />}
            {!rooms.loading && !rooms.data?.rooms.length && <EmptyState icon="🏫" title="還沒有讀書房" hint="建立私人／好友／班級讀書房，一起計時讀書。" />}
            <div className="grid gap-2 sm:grid-cols-2">
              {rooms.data?.rooms.map((r) => (
                <div key={r.id} className="glass-soft p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{r.name}</p>
                    <Badge tone="cyan">{r.kind === "class" ? "班級" : "讀書房"}</Badge>
                  </div>
                  <p className="text-[11px] text-muted">邀請碼：{r.joinCode}</p>
                  <div className="mt-1.5">
                    <Progress value={r.totalToday} max={r.goalMinutes} tone="cyan" />
                    <p className="mt-1 text-[11px] text-muted">
                      今日共同專注 {r.totalToday}/{r.goalMinutes} 分鐘
                    </p>
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs">
                    {r.members.map((m) => (
                      <div key={m.userId} className="flex justify-between">
                        <span>{m.displayName}</span>
                        <span className="text-muted">{m.minutesToday} 分</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={async () => {
                      await apiDelete(`/rooms/${r.id}/leave`);
                      await rooms.reload();
                    }}
                  >
                    離開
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "activity" && (
        <Card title="🎉 活動">
          {activities.loading && <Skeleton lines={3} />}
          {!activities.loading && !activities.data?.live.length && <EmptyState icon="🎈" title="目前沒有進行中的活動" />}
          <div className="space-y-2">
            {activities.data?.live.map((a) => (
              <div key={a.id} className="glass-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {a.cover} {a.title}
                  </p>
                  <Badge tone="gold">
                    +{a.rewardNova} Nova / +{a.rewardXp} XP
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{a.description}</p>
                <div className="mt-1.5">
                  <Progress value={a.progress} max={a.goalValue} tone="gold" />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {a.progress}/{a.goalValue}・結束 {new Date(a.endsAt).toLocaleString("zh-TW")}
                </p>
                {a.questionCount > 0 && <Button size="sm" className="mt-2" onClick={() => setActivityQuestionId(a.id)}>開啟活動專屬題庫（{a.questionCount} 題）</Button>}
              </div>
            ))}
          </div>
          {activityQuestionId && <Card title="活動專屬題庫" subtitle="只有活動進行期間才會顯示與開放作答。">
            {activityQuestions.loading && <Skeleton lines={3} />}
            {activityQuestions.data?.questions.map((q, index) => <div key={q.id} className="glass-soft mb-2 p-3"><p className="text-sm font-medium">{index + 1}. {q.stem}</p>{q.options.length > 0 && <div className="mt-2 grid gap-1 sm:grid-cols-2">{q.options.map((option) => <span key={option} className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs">{option}</span>)}</div>}<p className="mt-2 text-xs text-muted">題型：{q.type}・{q.subject}</p></div>)}
          </Card>}
          {activities.data?.upcoming.length ? (
            <div className="mt-3 space-y-1 text-xs text-muted">
              <p>即將開始</p>
              {activities.data.upcoming.map((u) => (
                <p key={u.id}>
                  · {u.title}（{new Date(u.startsAt).toLocaleDateString("zh-TW")}）
                </p>
              ))}
            </div>
          ) : null}
        </Card>
      )}

      {tab === "board" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="🏆 本週學習時間排行">
            {board.loading && <Skeleton lines={4} />}
            <div className="space-y-1.5">
              {board.data?.weekly.map((r, i) => (
                <div key={r.userId} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${r.userId === board.data?.me ? "bg-[#37d3ff]/10" : ""}`}>
                  <span>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {r.displayName}
                  </span>
                  <span className="tabular-nums text-muted">{r.minutes} 分</span>
                </div>
              ))}
              {!board.data?.weekly.length && <EmptyState icon="🏁" title="本週還沒有紀錄" />}
            </div>
          </Card>
          <Card title="✨ XP 排行">
            <div className="space-y-1.5">
              {board.data?.xp.map((r, i) => (
                <div key={r.userId} className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${r.userId === board.data?.me ? "bg-[#7c5cff]/10" : ""}`}>
                  <span>
                    {i + 1}. {r.displayName}
                  </span>
                  <span className="tabular-nums text-muted">
                    Lv.{r.level}・{r.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal open={Boolean(qr)} onClose={() => setQr(null)} title="我的 NOVA ID QR Code">
        {qr && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-48 rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p className="text-lg font-bold tracking-widest">{qr.novaId}</p>
            <Button
              onClick={async () => {
                const res = await shareContent({ title: "加我 StudyNova 好友", text: `我的 NOVA ID 是 ${qr.novaId}`, url: qr.link });
                toast.push("success", res === "copied" ? "已複製邀請連結" : "已開啟分享");
              }}
            >
              分享邀請連結
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={challengeOpen} onClose={() => setChallengeOpen(false)} title="發起挑戰">
        <div className="space-y-3">
          <Field label="挑戰類型">
            <Select value={cForm.kind} onChange={(e) => setCForm({ ...cForm, kind: e.target.value })}>
              <option value="word">單字挑戰</option>
              <option value="quiz">測驗挑戰</option>
              <option value="weekly">每週小考競賽</option>
            </Select>
          </Field>
          <Field label="標題" required>
            <Input value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} placeholder="英文單字 1v1" />
          </Field>
          {cForm.kind === "weekly" && (
            <Field label="選擇每週小考">
              <Select value={cForm.quizId} onChange={(e) => setCForm({ ...cForm, quizId: e.target.value })}>
                <option value="">請選擇…</option>
                {weekly.data?.weeks.filter((w) => w.open).map((w) => (
                  <option key={w.id} value={w.id}>{w.weekCode}｜{w.title}{w.proOnly ? "（PRO）" : ""}</option>
                ))}
              </Select>
            </Field>
          )}
          {cForm.kind === "word" && (
            <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="題庫來源"><Select value={cForm.source} onChange={(e) => setCForm({ ...cForm, source: e.target.value as "catalog" | "mine" | "vocabulary" })}><option value="catalog">分級單字</option><option value="mine">我的單字</option><option value="vocabulary" disabled={!vocabulary.data?.sourceAvailability?.unlocked}>字詞百科{vocabulary.data?.sourceAvailability?.unlocked ? "" : `（未開放・${vocabulary.data?.sourceAvailability?.totalWords ?? 0}/100）`}</option></Select></Field>
              <Field label="詞庫"><Select value={cForm.track} disabled={cForm.source === "mine"} onChange={(e) => setCForm({ ...cForm, track: e.target.value as "junior" | "senior" })}><option value="junior">國中 2000 單</option><option value="senior">高中 7000 單</option></Select></Field>
              <Field label="題數"><Select value={String(cForm.questionCount)} onChange={(e) => setCForm({ ...cForm, questionCount: Number(e.target.value) })}><option value="5">5 題</option><option value="10">10 題</option><option value="20">20 題</option><option value="50">50 題</option></Select></Field>
              <Field label="難度"><Select value={cForm.difficulty} onChange={(e) => setCForm({ ...cForm, difficulty: e.target.value as "easy" | "normal" | "hard" })}><option value="easy">簡單</option><option value="normal">普通</option><option value="hard">困難</option></Select></Field>
                                <Field label="題目方向"><Select value={cForm.direction} onChange={(e) => setCForm({ ...cForm, direction: e.target.value as "zh2en" | "en2zh" | "mixed" })}><option value="mixed">中英混合</option><option value="zh2en">中文 → 英文</option><option value="en2zh">英文 → 中文</option></Select></Field>
              <Field label="作答模式"><Select value={cForm.challengeMode} onChange={(e) => setCForm({ ...cForm, challengeMode: e.target.value as ChallengeMode })}><option value="choice">四選一</option><option value="meaning">多義選擇</option><option value="part_of_speech">詞性辨識</option><option value="handwriting">手寫作答</option><option value="listening">聽力・播放英文後手寫單字</option><option value="semantic_image">辨識語意・四圖選義</option><option value="confusable">易混淆辨析</option></Select></Field>
              <Field label="作答速度"><Select value={cForm.timeMode} onChange={(e) => setCForm({ ...cForm, timeMode: e.target.value as TimeMode })}><option value="standard">一般：依題型 25–45 秒</option><option value="sprint">速戰速決：每題 10 秒</option></Select></Field>
            </div>
          )}
          {cForm.kind === "quiz" && (
            <Field label="選擇測驗">
              <Select value={cForm.quizId} onChange={(e) => setCForm({ ...cForm, quizId: e.target.value })}>
                <option value="">請選擇…</option>
                {quizzes.data?.quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="持續時間（小時）">
            <Input type="number" min={1} max={168} value={cForm.durationHours} onChange={(e) => setCForm({ ...cForm, durationHours: Number(e.target.value) })} />
          </Field>
          <Button
            full
            onClick={async () => {
              try {
                await apiPost("/challenges", {
                  kind: cForm.kind,
                  title: cForm.title,
                  quizId: cForm.kind === "quiz" ? cForm.quizId || null : null,
                  weekId: cForm.kind === "weekly" ? cForm.quizId || null : null,
                  durationHours: cForm.durationHours,
                  track: cForm.track,
                  source: cForm.source,
                  questionCount: cForm.questionCount,
                  direction: cForm.direction,
                  difficulty: cForm.difficulty,
                  challengeMode: cForm.challengeMode,
                  timeMode: cForm.timeMode,
                  inviteIds: friends.data?.friends.map((f) => f.userId) ?? [],
                });
                toast.push("success", "挑戰已建立，已通知好友");
                setChallengeOpen(false);
                await challenges.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            建立挑戰
          </Button>
        </div>
      </Modal>

      <Modal open={roomOpen} onClose={() => setRoomOpen(false)} title="建立讀書房">
        <div className="space-y-3">
          <Field label="名稱" required>
            <Input value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} />
          </Field>
          <Field label="類型">
            <Select value={roomForm.kind} onChange={(e) => setRoomForm({ ...roomForm, kind: e.target.value })}>
              <option value="room">好友讀書房</option>
              <option value="class">班級</option>
            </Select>
          </Field>
          <Field label="每日共同目標（分鐘）">
            <Input type="number" min={30} max={1200} value={roomForm.goalMinutes} onChange={(e) => setRoomForm({ ...roomForm, goalMinutes: Number(e.target.value) })} />
          </Field>
          <Button
            full
            onClick={async () => {
              try {
                await apiPost("/rooms", roomForm);
                toast.push("success", "讀書房已建立");
                setRoomOpen(false);
                await rooms.reload();
              } catch (err) {
                toast.push("error", errorMessage(err));
              }
            }}
          >
            建立
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function ChallengePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入中…</p>}>
      <ChallengeInner />
    </Suspense>
  );
}
