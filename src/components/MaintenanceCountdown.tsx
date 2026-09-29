"use client";

import { useSyncExternalStore } from "react";
import { getMaintenanceCountdownParts } from "@/lib/maintenance";

function subscribeToClock(onTick: () => void) {
  const timer = window.setInterval(onTick, 1_000);
  return () => window.clearInterval(timer);
}

function getClockSnapshot() {
  return Date.now();
}

function getServerClockSnapshot() {
  return 0;
}

function ClockUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-amber-200/15 bg-[#080d1c]/80 px-2 py-2 sm:px-3">
      <span className="block font-mono text-xl font-black tabular-nums tracking-wider text-amber-100 sm:text-2xl">{value}</span>
      <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{label}</span>
    </div>
  );
}

export function MaintenanceCountdown({ targetAt }: { targetAt: string | null }) {
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  if (!targetAt) return null;
  const parts = now === 0 ? null : getMaintenanceCountdownParts(targetAt, now);
  if (now !== 0 && !parts) {
    return <p role="status" className="mt-4 text-xs text-rose-200">預計恢復時間資料無效，請管理員檢查設定。</p>;
  }

  const values = parts
    ? [String(parts.days).padStart(2, "0"), String(parts.hours).padStart(2, "0"), String(parts.minutes).padStart(2, "0"), String(parts.seconds).padStart(2, "0")]
    : ["--", "--", "--", "--"];

  return (
    <div className="mx-auto mt-5 w-full max-w-xl rounded-2xl border border-amber-200/20 bg-amber-300/[0.045] p-4 text-center" role="timer" aria-live="off" aria-label="距離預計恢復時間倒數">
      <p className="mb-3 text-xs font-bold tracking-wide text-amber-100">距離預計恢復</p>
      <div className="grid grid-cols-4 gap-2">
        <ClockUnit value={values[0]} label="日" />
        <ClockUnit value={values[1]} label="時" />
        <ClockUnit value={values[2]} label="分" />
        <ClockUnit value={values[3]} label="秒" />
      </div>
      {parts?.expired && <p className="mt-3 text-xs text-amber-100">已到預計恢復時間，請稍候重新整理查看公告。</p>}
    </div>
  );
}
