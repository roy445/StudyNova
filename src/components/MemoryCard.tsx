"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Progress } from "@/components/ui";

export type MemoryCardWord = {
  id: string;
  word: string;
  meaning: string;
  example?: string | null;
  example_zh?: string | null;
  part_of_speech?: string | null;
  familiarity?: number | null;
};

type MemoryCardProps = {
  words: MemoryCardWord[];
  sourceKey: string;
  title?: string;
  subtitle?: string;
};

function readFavorites(storageKey: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function MemoryCard({ words, sourceKey, title = "記憶卡", subtitle = "先想想看，再點擊中文查看答案。" }: MemoryCardProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loop, setLoop] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites(`studynova:memory-card:favorites:${sourceKey}`));
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = words[index];
  const favoriteStorageKey = `studynova:memory-card:favorites:${sourceKey}`;

  useEffect(() => {
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!autoPlay || !current || words.length < 2) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      speak(current.word);
      autoTimer.current = setTimeout(() => {
        setRevealed(false);
        setIndex((value) => {
          if (value + 1 < words.length) return value + 1;
          if (loop) return 0;
          setAutoPlay(false);
          return value;
        });
      }, 3000);
    }, 420);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [autoPlay, current, loop, words.length]);

  const favoriteLabel = useMemo(() => (current && favorites.has(current.id) ? "取消收藏" : "加入收藏"), [current, favorites]);

  if (!words.length) {
    return (
      <Card title={title} subtitle="目前沒有可複習的單字">
        <div className="glass-soft p-6 text-center text-sm text-muted">單字準備好後，記憶卡會出現在這裡。</div>
      </Card>
    );
  }

  if (!current) return null;

  function goTo(nextIndex: number) {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setRevealed(false);
    setIndex(nextIndex);
  }

  function goPrevious() {
    goTo(index > 0 ? index - 1 : loop ? words.length - 1 : 0);
  }

  function goNext() {
    if (index + 1 < words.length) {
      goTo(index + 1);
      return;
    }
    if (loop) {
      goTo(0);
      return;
    }
    setAutoPlay(false);
  }

  function toggleFavorite() {
    const next = new Set(favorites);
    if (next.has(current.id)) next.delete(current.id);
    else next.add(current.id);
    setFavorites(next);
    try {
      window.localStorage.setItem(favoriteStorageKey, JSON.stringify([...next]));
    } catch {
      // Keep the in-memory state when persistence is blocked.
    }
  }

  return (
    <Card title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>第 {index + 1} / {words.length} 張</span>
          <div className="flex items-center gap-2">
            <Badge tone={revealed ? "cyan" : "muted"}>{revealed ? "已顯示中文" : "先想英文"}</Badge>
            <button
              type="button"
              onClick={toggleFavorite}
              className={`focus-ring inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 transition ${favorites.has(current.id) ? "border-[#ffc857]/60 bg-[#ffc857]/10 text-[#ffc857]" : "border-[var(--line)] bg-white/5 text-muted hover:bg-white/10"}`}
              title={favoriteLabel}
              aria-label={favoriteLabel}
            >
              <span aria-hidden="true" className="text-base leading-none">{favorites.has(current.id) ? "★" : "☆"}</span>
              <span className="hidden sm:inline">{favorites.has(current.id) ? "已收藏" : "收藏"}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`memory-card-rainbow group relative min-h-[310px] w-full overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(55,211,255,0.14),transparent_42%),linear-gradient(145deg,rgba(19,29,57,0.98),rgba(10,14,31,0.98))] px-5 py-8 text-center shadow-[0_24px_80px_-40px_rgba(55,211,255,0.8)] transition hover:border-[#37d3ff]/40 sm:min-h-[360px] sm:px-10`}
          onClick={() => setRevealed((value) => !value)}
          aria-label={revealed ? "隱藏中文" : "顯示中文"}
        >
          <span className="absolute left-5 top-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#37d3ff]/70">StudyNova / Memory</span>
          <span className="memory-card-spark absolute right-5 top-12" aria-hidden="true">✦</span>
          <span className="absolute right-5 top-5 text-xs text-muted">{revealed ? "中英對照" : "英文提示"}</span>
          <span className="flex min-h-[250px] flex-col items-center justify-center gap-3">
            <span className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">{current.word}</span>
            {current.part_of_speech && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted">{current.part_of_speech}</span>}
            <span className={`max-w-[34rem] text-lg leading-relaxed transition sm:text-xl ${revealed ? "text-[#37d3ff]" : "text-white/30"}`}>
              {revealed ? current.meaning : "點擊卡片查看中文"}
            </span>
            {revealed && current.example && (
              <span className="max-w-[38rem] space-y-1 text-sm leading-relaxed text-muted">
                <span className="block">{current.example}</span>
                {current.example_zh && <span className="block text-white/55">{current.example_zh}</span>}
              </span>
            )}
          </span>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-muted transition group-hover:text-[#37d3ff]">{revealed ? "點擊卡片隱藏中文" : "點擊卡片翻面"}</span>
        </button>

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="ghost" onClick={() => setRevealed((value) => !value)}>
            {revealed ? "隱藏中文" : "中文"}
          </Button>
          <Button variant="ghost" onClick={() => { if (!speak(current.word)) window.alert("此瀏覽器不支援語音朗讀"); }}>
            朗讀
          </Button>
          <Button variant="outline" onClick={goPrevious} disabled={!loop && index === 0}>
            上一個
          </Button>
          <Button onClick={goNext}>
            下一個
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setLoop((value) => !value)}
            className={`focus-ring flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition ${loop ? "border-[#37d3ff]/50 bg-[#37d3ff]/10" : "border-[var(--line)] bg-white/5"}`}
          >
            <span><span className="mr-2 text-base" aria-hidden="true">↻</span>全部循環</span>
            <span className="text-muted">{loop ? "開啟" : "關閉"}</span>
          </button>
          <button
            type="button"
            onClick={() => setAutoPlay((value) => !value)}
            className={`focus-ring flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition ${autoPlay ? "border-[#a78bfa]/60 bg-[#a78bfa]/10" : "border-[var(--line)] bg-white/5"}`}
          >
            <span><span className="mr-2 text-base" aria-hidden="true">▷</span>連續播放</span>
            <span className="text-muted">{autoPlay ? "播放中" : "關閉"}</span>
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>熟悉度 {current.familiarity ?? 0}%</span>
            <span>{favorites.size} 張已收藏</span>
          </div>
          <Progress value={current.familiarity ?? 0} max={100} tone="cyan" />
        </div>
      </div>
    </Card>
  );
}
