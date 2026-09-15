"use client";
import { useEffect } from "react";

type ActiveCategory = { slug: string; routePath: string; componentKey: string; tokens: Record<string, string> };
const DEFAULTS: Record<string, string> = {
  primary: "#7c5cff", secondary: "#37d3ff", accent: "#ffc857", surface: "rgba(16,26,51,0.72)", line: "rgba(124,92,255,0.18)", radius: "22px", shadow: "0 18px 50px -24px rgba(6,10,30,0.9)", glow: "0 0 24px rgba(124,92,255,0.22)", buttonRadius: "14px", motion: "220ms", pageBackground: "",
};
export default function CustomizationRuntime() {
  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      try {
        const response = await fetch("/api/v1/customization/active", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { categories?: ActiveCategory[] };
        if (cancelled) return;
        const path = window.location.pathname;
        const category = payload.categories?.find((item) => item.routePath === path || item.routePath === "*" || (item.routePath && path.startsWith(item.routePath)));
        const tokens = { ...DEFAULTS, ...(category?.tokens ?? {}) };
        const root = document.documentElement;
        for (const [key, value] of Object.entries(tokens)) root.style.setProperty(`--custom-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
        document.body.dataset.customCategory = category?.slug ?? "default";
        if (tokens.pageBackground) document.body.style.background = tokens.pageBackground;
      } catch { /* Styling must never block the application. */ }
    };
    void apply();
    return () => { cancelled = true; };
  }, []);
  return null;
}
