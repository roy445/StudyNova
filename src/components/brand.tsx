"use client";


import Image from "next/image";
import { useEffect, useState } from "react";

export type NoviState = "idle" | "thinking" | "happy" | "cheer" | "analyze" | "speak" | "success" | "error" | "remind" | "levelup";

const STATE_COLOR: Record<NoviState, string> = {
  idle: "#37d3ff",
  thinking: "#7c5cff",
  happy: "#4ade80",
  cheer: "#ffc857",
  analyze: "#38bdf8",
  speak: "#22d3ee",
  success: "#34d399",
  error: "#fb7185",
  remind: "#f59e0b",
  levelup: "#ffc857",
};

const STATE_FACE: Record<NoviState, string> = {
  idle: "● ●",
  thinking: "· ·",
  happy: "◡ ◡",
  cheer: "✦ ✦",
  analyze: "◔ ◔",
  speak: "◉ ◉",
  success: "◡ ◡",
  error: "× ×",
  remind: "! !",
  levelup: "★ ★",
};

/** StudyNova square logo supplied by the product owner. The source art is intentionally kept intact. */
export function LogoMark({ size = 60, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <Image
      src="/brand/studynova-logo-square.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      sizes={`${size}px`}
      className={glow ? "rounded-full shadow-[0_0_24px_rgba(55,211,255,0.22)]" : "rounded-full"}
    />
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <Image
      src="/brand/studynova-logo-horizontal.webp"
      alt="StudyNova"
      width={Math.round(size * 7.4)}
      height={Math.round(size * 4.95)}
      sizes="(max-width: 640px) 72vw, 360px"
      className="h-auto max-h-20 w-auto max-w-[min(78vw,360px)] object-contain object-left"
    />
  );
}

/** Novi – floating spherical AI assistant (never a human figure). */
export function NoviAvatar({
  size = 72,
  state = "idle",
  aura,
  skin = "core-classic",
  core = "none",
  effect = "none",
  float = "none",
  level = 1,
}: {
  size?: number;
  state?: NoviState;
  aura?: string;
  skin?: string;
  core?: string;
  effect?: string;
  float?: string;
  level?: number;
}) {
  const [festive, setFestive] = useState(false);
  useEffect(() => {
    const sync = () => setFestive(document.documentElement.dataset.christmasNovi === "on");
    sync();
    window.addEventListener("studynova:theme", sync);
    return () => window.removeEventListener("studynova:theme", sync);
  }, []);
  const skinColor = skin === "skin-aurora" ? "#22d3ee" : skin === "skin-nebula" ? "#a78bfa" : skin === "skin-gold" ? "#fbbf24" : "#66e0ff";
  const color = aura ?? (skin !== "core-classic" ? skinColor : "#66e0ff");
  const bodyId = `novi-body-${state}-${skin.replace(/[^a-z0-9-]/gi, "")}`;
  const panelId = `novi-panel-${state}-${skin.replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <div className={`relative select-none ${float === "float-hover" ? "anim-float" : ""}`} style={{ width: size, height: size * 1.16, animationDuration: float === "float-hover" ? "2.6s" : undefined }} aria-label={`Novi 狀態：${state}，外觀：${skin}`}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl opacity-60"
        style={{ width: size * 0.95, height: size * 0.95, background: color }}
      />
      <svg width={size} height={size * 1.16} viewBox="0 0 100 116" fill="none" role="img" aria-label="Novi AI 機器人">
        <defs>
          <radialGradient id={bodyId} cx="35%" cy="22%" r="82%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#e8f4ff" />
            <stop offset="83%" stopColor="#b9cde5" />
            <stop offset="100%" stopColor="#7895b8" />
          </radialGradient>
          <linearGradient id={panelId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#172b45" />
            <stop offset="50%" stopColor="#061020" />
            <stop offset="100%" stopColor="#020711" />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="111" rx="23" ry="3.5" fill="#159cff" opacity="0.18" />
        <ellipse cx="50" cy="103" rx="16" ry="4" fill="#061a32" stroke="#66e0ff" strokeWidth="1.5" />
        <ellipse cx="50" cy="102" rx="10" ry="2.3" fill="#66e0ff" opacity="0.9" className="anim-pulse" />
        <path d="M50 17V7" stroke="#b9cde5" strokeWidth="3" strokeLinecap="round" />
        <circle cx="50" cy="6" r="5" fill="#dff7ff" stroke="#66e0ff" strokeWidth="2" className="anim-pulse" />
        <circle cx="50" cy="6" r="2" fill="#08bfff" />
        {festive && <>
          <path d="M28 20c7-10 25-15 43-7l-6 9H28Z" fill="#c83b4b" stroke="#ff7180" strokeWidth="1.2" />
          <path d="M27 20c14 5 31 4 40 1" stroke="#fff7e7" strokeWidth="4" strokeLinecap="round" />
          <circle cx="72" cy="13" r="4" fill="#fff7e7" stroke="#ffc857" strokeWidth="1" />
          <path d="M27 75c8 5 38 7 46 0v8c-12 8-34 8-46 0v-8Z" fill="#c83b4b" stroke="#ff7180" strokeWidth="1" />
          <path d="M31 78c10 4 27 5 38 0" stroke="#ffc857" strokeWidth="1.4" opacity="0.9" />
          <circle cx="17" cy="25" r="1.7" fill="#fff7e7" className="anim-pulse" /><circle cx="82" cy="25" r="1.7" fill="#fff7e7" className="anim-pulse" />
        </>}
        <path d="M17 46C17 27 30 17 50 17s33 10 33 29v24c0 12-12 20-33 20S17 82 17 70V46Z" fill={`url(#${bodyId})`} stroke="#d8edff" strokeWidth="1.5" />
        <path d="M12 48c0-5 3-9 7-10l4 3v22l-4 3c-4-1-7-5-7-10V48Z" fill="#9db7d4" stroke="#66e0ff" strokeWidth="1.4" />
        <path d="M88 48c0-5-3-9-7-10l-4 3v22l4 3c4-1 7-5 7-10V48Z" fill="#9db7d4" stroke="#66e0ff" strokeWidth="1.4" />
        <rect x="23" y="35" width="54" height="38" rx="17" fill={`url(#${panelId})`} stroke="#66e0ff" strokeOpacity="0.72" strokeWidth="1.8" />
        <path d="M29 42C40 36 60 36 71 42" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="38" cy="53" rx="4.2" ry="8" fill="#66e0ff" className="anim-pulse" />
        <ellipse cx="62" cy="53" rx="4.2" ry="8" fill="#66e0ff" className="anim-pulse" />
        <path d="M44 63c4 3 8 3 12 0" stroke="#66e0ff" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M35 80h30" stroke="#7592b3" strokeWidth="2" strokeLinecap="round" />
        <circle cx="50" cy="86" r="5" fill="#06213c" stroke="#66e0ff" strokeWidth="1.8" />
        <circle cx="50" cy="86" r="2" fill="#66e0ff" className="anim-pulse" />
        <path d="M25 80 19 91M75 80l6 11" stroke="#a9c9e6" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Star-trail particle field used on the landing / loading screen. */
export function StarField({ count = 26 }: { count?: number }) {
  const seeds = Array.from({ length: count }, (_, i) => ({
    x: (i * 37 + 11) % 100,
    y: (i * 61 + 17) % 100,
    d: (i * 29) % 40 / 10,
    s: 1 + ((i * 19) % 22) / 10,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {seeds.map((s, i) => (
        <span
          key={i}
          className="anim-pulse absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s`, opacity: 0.7 }}
        />
      ))}
    </div>
  );
}
