"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type ChristmasTheme = {
  enabled: boolean;
  snow: boolean;
  decorations: boolean;
  novi: boolean;
  particles: boolean;
  sound: boolean;
  intensity: "soft" | "balanced" | "festive";
  title: string;
  subtitle: string;
};

const DEFAULT_THEME: ChristmasTheme = {
  enabled: true,
  snow: true,
  decorations: true,
  novi: true,
  particles: true,
  sound: false,
  intensity: "balanced",
  title: "StudyNova Winter Festival",
  subtitle: "今年冬天，一起把知識裝進聖誕禮物裡。",
};

export default function ThemeLayer() {
  const [theme, setTheme] = useState<ChristmasTheme | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = () => apiGet<{ theme: ChristmasTheme }>("/theme/christmas")
      .then(({ theme: next }) => mounted && setTheme({ ...DEFAULT_THEME, ...next }))
      .catch(() => mounted && setTheme(DEFAULT_THEME));
    void load();
    window.addEventListener("studynova:theme-refresh", load);
    return () => {
      mounted = false;
      window.removeEventListener("studynova:theme-refresh", load);
    };
  }, []);
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const active = theme.enabled;
    root.dataset.festival = active ? "christmas" : "default";
    root.dataset.festivalIntensity = active ? theme.intensity : "none";
    root.dataset.christmasNovi = active && theme.novi ? "on" : "off";
    root.dataset.christmasDecorations = active && theme.decorations ? "on" : "off";
    root.dataset.christmasParticles = active && theme.particles ? "on" : "off";
    root.dataset.christmasSnow = active && theme.snow ? "on" : "off";
    window.dispatchEvent(new Event("studynova:theme"));
  }, [theme]);
  return theme?.enabled && theme.snow ? <div className="christmas-snowfall" aria-hidden="true" /> : null;
}

export type { ChristmasTheme };
