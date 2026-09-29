"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { inferSpeechLanguage, splitSpeechText, stripPronunciationAnnotations, type BrowserSpeechLanguage } from "@/lib/browser-speech";

type PlaybackState = "idle" | "speaking" | "paused";

const LANGUAGE_NAMES: Record<Exclude<BrowserSpeechLanguage, "auto">, string> = {
  "en-US": "English",
  "zh-TW": "繁體中文",
  "ru-RU": "Русский",
};

export function BrowserSpeechControls({ text, className = "" }: { text: string; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [language, setLanguage] = useState<BrowserSpeechLanguage>("auto");
  const [rate, setRate] = useState(1);
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [message, setMessage] = useState("");
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const generationRef = useRef(0);
  const languageRef = useRef<Exclude<BrowserSpeechLanguage, "auto">>("en-US");
  const rateRef = useRef(1);

  useEffect(() => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
    const synthesis = window.speechSynthesis;
    const refreshVoices = () => {
      const next = synthesis.getVoices();
      voicesRef.current = next;
      setVoices(next);
    };
    const frame = window.requestAnimationFrame(() => {
      setSupported(true);
      refreshVoices();
    });
    synthesis.addEventListener("voiceschanged", refreshVoices);
    return () => {
      generationRef.current += 1;
      synthesis.cancel();
      synthesis.removeEventListener("voiceschanged", refreshVoices);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  function speakNext(generation: number) {
    if (generation !== generationRef.current) return;
    const chunk = chunksRef.current[chunkIndexRef.current];
    if (!chunk) {
      setPlayback("idle");
      setMessage("朗讀完成。這段文字只在你的裝置上播放，沒有上傳或另存音檔。");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = languageRef.current;
    utterance.rate = rateRef.current;
    const targetLanguage = languageRef.current.toLowerCase();
    const voice = voicesRef.current.find((item) => item.lang.toLowerCase() === targetLanguage)
      ?? voicesRef.current.find((item) => item.lang.toLowerCase().startsWith(targetLanguage.split("-")[0]));
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (generation !== generationRef.current) return;
      chunkIndexRef.current += 1;
      speakNext(generation);
    };
    utterance.onerror = (event) => {
      if (generation !== generationRef.current) return;
      setPlayback("idle");
      setMessage(`裝置語音播放中斷（${event.error}）。請確認瀏覽器或手機已啟用語音服務。`);
    };
    window.speechSynthesis.speak(utterance);
  }

  function start() {
    if (!supported || !("speechSynthesis" in window)) {
      setMessage("此瀏覽器不支援內建語音朗讀，請改用支援 Speech Synthesis 的瀏覽器。");
      return;
    }
    const speechText = stripPronunciationAnnotations(text);
    const chunks = splitSpeechText(speechText);
    if (!chunks.length) {
      setMessage("這份教材目前沒有可朗讀的文字。");
      return;
    }

    const generation = ++generationRef.current;
    window.speechSynthesis.cancel();
    chunksRef.current = chunks;
    chunkIndexRef.current = 0;
    languageRef.current = language === "auto" ? inferSpeechLanguage(speechText) : language;
    rateRef.current = rate;
    setPlayback("speaking");
    const targetLanguage = LANGUAGE_NAMES[languageRef.current];
    const hasMatchingVoice = voicesRef.current.some((voice) => voice.lang.toLowerCase().startsWith(languageRef.current.split("-")[0]));
    setMessage(`正在以${targetLanguage}朗讀，共 ${chunks.length} 段。文字不會上傳，也不會生成音檔。${voices.length && !hasMatchingVoice ? " 裝置沒有列出相符語音，將嘗試使用預設語音。" : ""}`);
    speakNext(generation);
  }

  function stop() {
    generationRef.current += 1;
    chunksRef.current = [];
    chunkIndexRef.current = 0;
    if (supported) window.speechSynthesis.cancel();
    setPlayback("idle");
    setMessage("已停止朗讀。");
  }

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <Button size="sm" variant="ghost" disabled={!text.trim() || !supported} onClick={start} title="在目前裝置朗讀，不上傳文字、不保存音檔">裝置朗讀</Button>
      {playback === "speaking" && <Button size="sm" variant="ghost" onClick={() => { window.speechSynthesis.pause(); setPlayback("paused"); }}>暫停</Button>}
      {playback === "paused" && <Button size="sm" variant="ghost" onClick={() => { window.speechSynthesis.resume(); setPlayback("speaking"); }}>繼續</Button>}
      {playback !== "idle" && <Button size="sm" variant="ghost" onClick={stop}>停止</Button>}
      <label className="flex items-center gap-1 text-[11px] text-muted">
        <span>語言</span>
        <select value={language} onChange={(event) => setLanguage(event.target.value as BrowserSpeechLanguage)} disabled={playback !== "idle"} className="max-w-28 rounded-lg border border-[var(--line)] bg-black/20 px-1.5 py-1 text-xs text-[var(--text)]">
          <option value="auto">自動</option>
          <option value="en-US">English</option>
          <option value="zh-TW">繁體中文</option>
          <option value="ru-RU">Русский</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-[11px] text-muted">
        <span>語速</span>
        <select value={rate} onChange={(event) => setRate(Number(event.target.value))} disabled={playback !== "idle"} className="rounded-lg border border-[var(--line)] bg-black/20 px-1.5 py-1 text-xs text-[var(--text)]">
          <option value={0.8}>慢</option>
          <option value={1}>正常</option>
          <option value={1.2}>快</option>
        </select>
      </label>
      <p className="basis-full text-[10px] leading-4 text-muted" aria-live="polite">{message || (supported ? "裝置端播放，不需帳號或信用卡；語音依手機／瀏覽器支援而異，無法下載音檔。" : "正在檢查此瀏覽器的語音支援…")}</p>
    </div>
  );
}
