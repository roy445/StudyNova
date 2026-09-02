"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ApiError = { code: string; message: string; hint?: string; requestId?: string; docs?: string; details?: unknown };

export class ApiRequestError extends Error {
  code: string;
  hint: string;
  requestId: string;
  docs: string;
  status: number;
  details?: unknown;
  constructor(err: ApiError, status: number) {
    super(err.message);
    this.name = "ApiRequestError";
    this.code = err.code || "SN-SYS-9901";
    this.hint = err.hint ?? "";
    this.requestId = err.requestId ?? "";
    this.docs = err.docs ?? `/faq?code=${encodeURIComponent(err.code || "SN-SYS-9901")}`;
    this.status = status;
    this.details = err.details;
  }
  /** 顯示給使用者的完整訊息（含專屬錯誤代碼） */
  get display() {
    return `${this.message}（${this.code}）`;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new ApiRequestError(
        {
          code: res.headers.get("x-studynova-error") || `SN-HTTP-${res.status}`,
          message: `伺服器回應 ${res.status}`,
          hint: "請稍後再試；若持續發生請附上錯誤代碼回報問題。",
          requestId: res.headers.get("x-request-id") ?? "",
        },
        res.status,
      );
    }
    return (await res.text()) as unknown as T;
  }
  const json = (await res.json()) as { ok: boolean; data?: T; error?: ApiError };
  if (!res.ok || !json.ok) {
    throw new ApiRequestError(json.error ?? { code: "SN-SYS-9901", message: "未知錯誤" }, res.status);
  }
  return json.data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { credentials: "same-origin", cache: "no-store" });
  return parse<T>(res);
}

export async function apiSend<T>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export const apiPost = <T,>(path: string, body?: unknown) => apiSend<T>(path, "POST", body);
export const apiPatch = <T,>(path: string, body?: unknown) => apiSend<T>(path, "PATCH", body);
export const apiPut = <T,>(path: string, body?: unknown) => apiSend<T>(path, "PUT", body);
export const apiDelete = <T,>(path: string, body?: unknown) => apiSend<T>(path, "DELETE", body);

export type QueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  reload: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
};

export function useApi<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const result = await apiGet<T>(path);
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) {
        const info = errorInfo(err);
        setError(info.message);
        setErrorCode(info.code);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    error,
    errorCode,
    reload: load,
    setData: (updater) => setData((prev) => updater(prev)),
  };
}

export function useAsyncAction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Promise<TResult>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失敗");
        return null;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );
  return { run, pending, error, setError };
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.display;
  if (err instanceof Error) return err.message;
  return "發生未知錯誤（SN-SYS-9901）";
}

export function errorInfo(err: unknown): { message: string; code: string; hint: string; requestId: string } {
  if (err instanceof ApiRequestError) return { message: err.message, code: err.code, hint: err.hint, requestId: err.requestId };
  return {
    message: err instanceof Error ? err.message : "發生未知錯誤",
    code: "SN-SYS-9901",
    hint: "請重新整理頁面後再試一次。",
    requestId: "",
  };
}

/** 產生「回報問題」連結，自動帶入錯誤代碼與追蹤編號 */
export function reportLink(err: unknown, topic?: string): string {
  const info = errorInfo(err);
  const p = new URLSearchParams({ code: info.code });
  if (info.requestId) p.set("requestId", info.requestId);
  if (topic) p.set("topic", topic);
  return `/support?${p.toString()}`;
}

export async function shareContent(payload: { title: string; text: string; url: string }) {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share(payload);
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard.writeText(`${payload.title}\n${payload.text}\n${payload.url}`);
  return "copied";
}
