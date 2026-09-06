import type { ReactNode } from "react";

type Props = { cost: number | null | undefined; action?: string; balance?: number | null; className?: string; children?: ReactNode };

export function NovaCostNotice({ cost, action = "此操作", balance, className = "", children }: Props) {
  return (
    <div className={`rounded-xl border border-[#ffc857]/25 bg-[#ffc857]/8 px-3 py-2 text-xs text-[#ffe4a3] ${className}`}>
      {typeof cost !== "number" ? <strong>正在取得「{action}」的實際 Nova 費用，請稍候</strong> : cost > 0 ? <><strong>{action}將扣除 {cost} Nova</strong>{typeof balance === "number" && <span className="ml-2 text-[#fff1c7]/75">目前餘額 {balance} Nova</span>}</> : <strong>{action}免費，不會扣除 Nova</strong>}
      {children && <span className="ml-2 text-[#fff1c7]/75">{children}</span>}
    </div>
  );
}

export function confirmNovaSpend(action: string, cost: number | null | undefined, balance?: number | null) {
  if (typeof cost !== "number") return false;
  if (cost <= 0) return true;
  if (typeof window === "undefined") return false;
  const balanceText = typeof balance === "number" ? `目前餘額 ${balance} Nova。` : "";
  return window.confirm(`${action}需要扣除 ${cost} Nova。${balanceText}\n確定要繼續嗎？`);
}
