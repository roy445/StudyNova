"use client";

import { UserAvatar } from "@/components/UserAvatar";

type MatchmakingAnimationProps = {
  userId?: string | null;
  avatarSeed?: string | null;
  displayName?: string | null;
  status: "searching" | "no-players";
};

export function MatchmakingAnimation({ userId, avatarSeed, displayName, status }: MatchmakingAnimationProps) {
  const searching = status === "searching";
  return (
    <div className="pk-matchmaking-visual" aria-live="polite" aria-label={searching ? "正在尋找真人對手" : "目前沒有足夠的真人玩家"}>
      <div className="pk-matchmaking-orbit pk-matchmaking-orbit-one" />
      <div className="pk-matchmaking-orbit pk-matchmaking-orbit-two" />
      <div className="pk-matchmaking-player pk-matchmaking-player-you">
        <span className="pk-matchmaking-label">你</span>
        <UserAvatar userId={userId} avatarSeed={avatarSeed} displayName={displayName ?? "你"} size={72} className="ring-2 ring-[#37d3ff]/70 shadow-[0_0_28px_rgba(55,211,255,.45)]" />
        <span className="mt-2 max-w-24 truncate text-xs font-bold text-[#dff9ff]">{displayName ?? "你的頭像"}</span>
      </div>
      <div className="pk-matchmaking-link" aria-hidden="true">
        <span className="pk-matchmaking-link-core" />
        <span className="pk-matchmaking-link-node pk-matchmaking-link-node-one" />
        <span className="pk-matchmaking-link-node pk-matchmaking-link-node-two" />
        <span className="pk-matchmaking-link-node pk-matchmaking-link-node-three" />
        <span className="pk-matchmaking-database-mark">⌬</span>
      </div>
      <div className="pk-matchmaking-player pk-matchmaking-player-opponent">
        <span className="pk-matchmaking-label">{searching ? "尋找中" : "等待重新搜尋"}</span>
        <span className={`pk-question-avatar ${searching ? "pk-question-avatar-searching" : ""}`} aria-hidden="true">?</span>
        <span className="mt-2 text-xs font-bold text-muted">真人對手</span>
      </div>
      <p className="pk-matchmaking-caption">{searching ? "正在連線資料庫，搜尋符合條件的真人玩家" : "目前沒有足夠的真人玩家"}</p>
    </div>
  );
}
