import type { ReactNode } from "react";

type Props = { cost: number | null | undefined; action?: string; balance?: number | null; className?: string; children?: ReactNode };

/**
 * 費用不再以黃色提示框常駐顯示，改由實際操作按鈕與必要確認視窗呈現，避免干擾主畫面。
 * 保留元件介面，讓既有功能可以安全逐步改成按鈕內顯示費用。
 */
export function NovaCostNotice(_props: Props) {
  return null;
}

export function confirmNovaSpend(action: string, cost: number | null | undefined, balance?: number | null) {
  if (typeof cost !== "number") return false;
  if (cost <= 0) return true;
  if (typeof window === "undefined") return false;
  const balanceText = typeof balance === "number" ? `目前餘額 ${balance} Nova。` : "";
  return window.confirm(`${action}需要扣除 ${cost} Nova。${balanceText}\n確定要繼續嗎？`);
}
