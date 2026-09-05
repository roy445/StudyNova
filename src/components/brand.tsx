"use client";



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

/** StudyNova study mark supplied by the new brand lockup. */
export function LogoMark({ size = 40, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {glow && <span className="absolute inset-0 rounded-full bg-[#27c4bd]/15 blur-md" />}
      <img src="/studynova-mark.png" alt="" aria-hidden className="relative h-full w-full object-contain" />
    </span>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center overflow-hidden" style={{ width: size * 2.5, height: size * 2.15 }}>
      <img src="/studynova-logo.png" alt="StudyNova" className="h-full w-full object-contain" />
    </span>
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
  const skinColor = skin === "skin-aurora" ? "#22d3ee" : skin === "skin-nebula" ? "#a78bfa" : skin === "skin-gold" ? "#fbbf24" : "#eef3ff";
  const color = aura ?? (skin !== "core-classic" ? skinColor : STATE_COLOR[state]);
  const face = STATE_FACE[state];
  const bodyId = `novi-body-${state}-${skin.replace(/[^a-z0-9-]/gi, "")}`;
  return (
    <div className={`relative select-none ${float === "float-hover" ? "anim-float" : ""}`} style={{ width: size, height: size * 1.16, animationDuration: float === "float-hover" ? "2.6s" : undefined }} aria-label={`Novi 狀態：${state}，外觀：${skin}`}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl opacity-60"
        style={{ width: size * 0.95, height: size * 0.95, background: color }}
      />
      <svg width={size} height={size * 1.16} viewBox="0 0 100 116" fill="none">
        <defs>
          <radialGradient id={bodyId} cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor={skin === "skin-gold" ? "#fff7cf" : skin === "skin-nebula" ? "#f5edff" : "#ffffff"} />
            <stop offset="62%" stopColor={skin === "skin-aurora" ? "#d8fbff" : skin === "skin-nebula" ? "#e9ddff" : skin === "skin-gold" ? "#ffe9a3" : "#eef3ff"} />
            <stop offset="100%" stopColor={skinColor === "#eef3ff" ? "#c3ccec" : skinColor} />
          </radialGradient>
        </defs>
        {(effect === "effect-orbit" || level >= 4) && (
          <ellipse className="anim-orbit" cx="50" cy="50" rx="46" ry="17" stroke={color} strokeOpacity="0.5" strokeWidth="1.6" fill="none" />
        )}
        <ellipse cx="50" cy="106" rx="21" ry="5" fill={color} opacity="0.28" />
        <ellipse cx="50" cy="100" rx="13" ry="3" fill={color} opacity="0.5" />
        <path d="M50 9V2" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        <circle className="anim-pulse" cx="50" cy="2" r="3.2" fill={color} stroke="#eef3ff" strokeWidth="1.2" />
        <circle cx="50" cy="48" r="36" fill={`url(#${bodyId})`} />
        <circle cx="50" cy="48" r="36" stroke={color} strokeOpacity="0.75" strokeWidth="2.4" fill="none" />
        <path d="M25 30C33 20 67 20 75 30" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="50" cy="46" rx="25" ry="19" fill="#0b1226" />
        <text x="50" y="52" textAnchor="middle" fontSize="15" fill={color} fontFamily="monospace" letterSpacing="1.5">
          {face}
        </text>
        <rect x="6" y="41" width="9" height="16" rx="4.5" fill={color} opacity="0.9" />
        <rect x="85" y="41" width="9" height="16" rx="4.5" fill={color} opacity="0.9" />
        <circle className="anim-pulse novi-core-glow" cx="50" cy="82" r={core === "core-pulse" ? 6.4 : 4.2} fill={color} />
        {core === "core-pulse" && <circle className="anim-pulse" cx="50" cy="82" r="11" stroke={color} strokeOpacity="0.45" strokeWidth="1.4" fill="none" />}
        {(effect === "effect-sparkle" || state === "cheer" || state === "levelup") && (
          <>
            <circle className="anim-pulse" cx="18" cy="20" r="2.4" fill="#ffc857" />
            <circle className="anim-pulse" cx="82" cy="24" r="2" fill="#37d3ff" />
            <circle className="anim-pulse" cx="76" cy="88" r="1.8" fill="#a78bfa" />
          </>
        )}
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
