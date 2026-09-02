"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/* --------------------------------------------------------------- toast */

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ToastCtx = { push: (kind: Toast["kind"], text: string) => void };
const ToastContext = createContext<ToastCtx>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[200] flex w-[min(94vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`anim-pop pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-xl ${
              t.kind === "success"
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
                : t.kind === "error"
                  ? "border-rose-400/40 bg-rose-500/15 text-rose-100"
                  : "border-sky-400/40 bg-sky-400/15 text-sky-100"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* -------------------------------------------------------------- button */

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void | Promise<void>;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "outline" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  full?: boolean;
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  title,
  full = false,
}: ButtonProps) {
  const [busy, setBusy] = useState(false);
  const isBusy = loading || busy;
  const base =
    "focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-3 py-1.5 text-xs min-h-[34px]", md: "px-4 py-2.5 text-sm min-h-[42px]", lg: "px-6 py-3 text-base min-h-[50px]" };
  const variants = {
    primary: "bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] text-white shadow-[0_10px_30px_-12px_rgba(124,92,255,0.9)] hover:brightness-110",
    ghost: "bg-white/5 text-[var(--text)] hover:bg-white/10 border border-[var(--line)]",
    outline: "border border-[var(--line)] bg-transparent text-[var(--text)] hover:bg-white/5",
    danger: "bg-rose-500/90 text-white hover:bg-rose-500",
    gold: "bg-gradient-to-r from-[#ffc857] to-[#ff9f43] text-[#2c1c00] font-semibold hover:brightness-105",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || isBusy}
      onClick={async () => {
        if (!onClick) return;
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
      className={`${base} ${sizes[size]} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {isBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- card */

export function Card({ children, className = "", title, subtitle, action, delay = 0 }: { children?: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; delay?: number }) {
  return (
    <section className={`glass anim-in p-4 sm:p-5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted sm:text-sm">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "gold" | "cyan" | "violet" }) {
  const tones = {
    default: "text-[var(--text)]",
    gold: "text-[#ffc857]",
    cyan: "text-[#37d3ff]",
    violet: "text-[#a78bfa]",
  };
  return (
    <div className="glass-soft p-3">
      <p className="truncate text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- input */

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  "focus-ring w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[color:var(--muted)] transition focus:border-[#37d3ff]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${inputBase} ${className}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${inputBase} min-h-[96px] resize-y ${className}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${inputBase} appearance-none bg-[var(--surface-solid)] ${className}`}>
      {children}
    </select>
  );
}

/* ---------------------------------------------------------------- misc */

export function Badge({ children, tone = "violet" }: { children: ReactNode; tone?: "violet" | "cyan" | "gold" | "green" | "rose" | "muted" }) {
  const tones = {
    violet: "bg-[#7c5cff]/15 text-[#c4b5fd] border-[#7c5cff]/30",
    cyan: "bg-[#37d3ff]/15 text-[#7dd3fc] border-[#37d3ff]/30",
    gold: "bg-[#ffc857]/15 text-[#ffd98a] border-[#ffc857]/40",
    green: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
    rose: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    muted: "bg-white/5 text-[color:var(--muted)] border-[var(--line)]",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Progress({ value, max = 100, tone = "violet" }: { value: number; max?: number; tone?: "violet" | "gold" | "cyan" | "green" }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const tones = {
    violet: "from-[#7c5cff] to-[#37d3ff]",
    gold: "from-[#ffc857] to-[#ff9f43]",
    cyan: "from-[#37d3ff] to-[#7c5cff]",
    green: "from-emerald-400 to-teal-300",
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
      <div className={`h-full rounded-full bg-gradient-to-r ${tones[tone]} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = "◇", title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, code, requestId }: { message: string; onRetry?: () => void; code?: string | null; requestId?: string | null }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
      <p className="font-medium"><span className="mr-1 text-rose-300">!</span>{message}</p>
      {(code || requestId) && (
        <p className="mt-1 font-mono text-[11px] opacity-80">
          {code ? `錯誤代碼：${code}` : ""}
          {code && requestId ? "　" : ""}
          {requestId ? `追蹤編號：${requestId}` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            重試
          </Button>
        )}
        {code && (
          <a href={`/faq?code=${encodeURIComponent(code)}`} className="focus-ring inline-flex items-center rounded-xl border border-rose-300/40 px-3 py-1.5 text-xs">
            查看這個代碼
          </a>
        )}
        <a
          href={`/support?code=${encodeURIComponent(code ?? "")}${requestId ? `&requestId=${encodeURIComponent(requestId)}` : ""}`}
          className="focus-ring inline-flex items-center rounded-xl border border-rose-300/40 px-3 py-1.5 text-xs"
        >
          回報問題
        </a>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`glass anim-pop max-h-[92dvh] w-full overflow-y-auto scroll-thin rounded-b-none p-4 sm:rounded-3xl sm:p-5 ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="關閉" className="focus-ring rounded-lg px-2 py-1 text-muted hover:bg-white/10">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: Array<{ key: string; label: string; icon?: string }>; active: string; onChange: (key: string) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`focus-ring shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
            active === t.key ? "bg-gradient-to-r from-[#7c5cff] to-[#37d3ff] text-white shadow-lg" : "border border-[var(--line)] bg-white/5 text-muted hover:text-[var(--text)]"
          }`}
        >
          {t.icon && <span className="mr-1">{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Confirm({ open, title, description, onCancel, onConfirm, danger = false }: { open: boolean; title: string; description?: string; onCancel: () => void; onConfirm: () => Promise<void> | void; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {description && <p className="text-sm text-muted">{description}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          確認
        </Button>
      </div>
    </Modal>
  );
}
